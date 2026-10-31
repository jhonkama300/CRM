/**
 * Best-effort transcription for inbound WhatsApp voice notes.
 *
 * The AI assistant only reads text. This turns an inbound audio message
 * into a text transcript before the webhook inserts it, so the transcript
 * flows into the inbox preview, the Flows engine, automations, and the
 * AI context like any other customer text.
 *
 * Supported with the account's existing BYO key:
 *   - OpenAI: `/v1/audio/transcriptions` (Whisper)
 *   - Gemini via the OpenAI-compatible config: native `generateContent`
 *     with an inline audio part (the compatible `/chat/completions`
 *     endpoint does not accept audio).
 *
 * Any other provider is a no-op. Everything is best-effort: the webhook
 * must never fail because transcription failed.
 */

import { loadAiConfig } from './config'
import { supabaseAdmin } from './admin-client'
import { downloadMedia, getMediaUrl } from '@/lib/whatsapp/meta-api'
import type { AiConfig } from './types'

const MAX_AUDIO_BYTES = 16 * 1024 * 1024
const TRANSCRIPTION_TIMEOUT_MS = 30_000
const GEMINI_TRANSCRIBE_PROMPT =
  'Transcribe this WhatsApp voice message verbatim in its original language. ' +
  'Return only the transcript text, no quotes, no labels, no commentary. ' +
  'If there is no intelligible speech, return an empty string.'

const OPENAI_TRANSCRIPTIONS_URL =
  'https://api.openai.com/v1/audio/transcriptions'

export interface TranscribeInboundAudioArgs {
  accountId: string
  mediaId: string
  /** Meta access token, used only when the mirror URL isn't fetchable. */
  accessToken: string
  /** Durable Supabase URL from the inbound mirror, when available. */
  mediaUrl?: string | null
  /** Meta's MIME type for the voice note. */
  mimeType?: string | null
}

/**
 * Return the account's provider-native Gemini endpoint for a model.
 * The stored base URL is the OpenAI-compatible one
 * (`.../v1beta/openai`); strip that suffix and append the native
 * `models/<model>:generateContent` path.
 */
export function geminiGenerateUrl(baseUrl: string, model: string): string {
  const url = new URL(baseUrl)
  const path = url.pathname
    .replace(/\/openai\/?$/, '')
    .replace(/\/+$/, '')
  url.pathname = `${path}/models/${encodeURIComponent(model)}:generateContent`
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function isGeminiBaseUrl(baseUrl: string | null): boolean {
  if (!baseUrl) return false
  try {
    return new URL(baseUrl).hostname === 'generativelanguage.googleapis.com'
  } catch {
    return false
  }
}

export function extractGeminiText(data: unknown): string | null {
  const candidates = (data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown }> }
    }>
  })?.candidates
  const text = (candidates ?? [])
    .flatMap((c) => c.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || null
}

function cleanTranscript(text: string | null): string | null {
  if (!text) return null
  const cleaned = text
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()
  return cleaned || null
}

function audioFileName(mimeType: string): string {
  if (mimeType.includes('mpeg')) return 'audio.mp3'
  if (mimeType.includes('mp4')) return 'audio.m4a'
  if (mimeType.includes('wav')) return 'audio.wav'
  if (mimeType.includes('webm')) return 'audio.webm'
  return 'audio.ogg'
}

async function loadAudioBytes(
  args: TranscribeInboundAudioArgs,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // The webhook already mirrored the file to Supabase Storage in the
  // normal path. Fetching that public URL avoids a second Meta round
  // trip; fall back to Meta when mirroring was disabled/failed.
  if (args.mediaUrl && /^https?:\/\//i.test(args.mediaUrl)) {
    try {
      const res = await fetch(args.mediaUrl, {
        signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
      })
      if (res.ok) {
        return {
          buffer: Buffer.from(await res.arrayBuffer()),
          mimeType:
            args.mimeType ||
            res.headers.get('content-type') ||
            'audio/ogg',
        }
      }
    } catch {
      // Fall through to Meta.
    }
  }

  const info = await getMediaUrl({
    mediaId: args.mediaId,
    accessToken: args.accessToken,
  })
  if (info.fileSize && info.fileSize > MAX_AUDIO_BYTES) return null

  const downloaded = await downloadMedia({
    downloadUrl: info.url,
    accessToken: args.accessToken,
  })
  return {
    buffer: downloaded.buffer,
    mimeType: args.mimeType || info.mimeType || downloaded.contentType,
  }
}

async function transcribeWithOpenAi(
  config: AiConfig,
  audio: { buffer: Buffer; mimeType: string },
): Promise<string | null> {
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(audio.buffer)], { type: audio.mimeType }),
    audioFileName(audio.mimeType),
  )
  form.append('model', 'whisper-1')
  form.append('response_format', 'json')

  const res = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `OpenAI transcription failed (${res.status}): ${detail.slice(0, 200)}`,
    )
  }
  const data = (await res.json().catch(() => null)) as {
    text?: unknown
  } | null
  return typeof data?.text === 'string' ? data.text : null
}

/**
 * Transcription is more availability-sensitive than chat: a single
 * Gemini Flash variant can be saturated (503) while its siblings are
 * healthy. Keep the account's configured model first, then try stable
 * fallbacks. This does NOT change the chat model.
 */
const GEMINI_TRANSCRIPTION_FALLBACKS = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
]

export function geminiTranscriptionModels(primary: string): string[] {
  return [...new Set([primary, ...GEMINI_TRANSCRIPTION_FALLBACKS])]
}

async function requestGeminiTranscription(
  config: AiConfig,
  audio: { buffer: Buffer; mimeType: string },
  model: string,
): Promise<string | null> {
  if (!config.baseUrl) return null
  const url = geminiGenerateUrl(config.baseUrl, model)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: GEMINI_TRANSCRIBE_PROMPT },
            {
              inline_data: {
                mime_type: audio.mimeType,
                data: audio.buffer.toString('base64'),
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
      },
    }),
    signal: AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Gemini transcription failed (${res.status}, ${model}): ${detail.slice(
        0,
        200,
      )}`,
    )
  }
  return extractGeminiText(await res.json().catch(() => null))
}

async function transcribeWithGemini(
  config: AiConfig,
  audio: { buffer: Buffer; mimeType: string },
): Promise<string | null> {
  let lastError: unknown = null
  for (const model of geminiTranscriptionModels(config.model)) {
    try {
      const text = await requestGeminiTranscription(config, audio, model)
      if (text) return text
    } catch (err) {
      lastError = err
      console.warn(
        `[transcribe] Gemini model ${model} failed, trying next:`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  if (lastError) throw lastError
  return null
}

/**
 * Transcribe one inbound voice note. Returns null when the account has
 * no compatible AI config, the file is too big, or the provider fails.
 */
export async function transcribeInboundAudio(
  args: TranscribeInboundAudioArgs,
): Promise<string | null> {
  try {
    const config = await loadAiConfig(supabaseAdmin(), args.accountId)
    if (!config) return null

    const openAi = config.provider === 'openai'
    const gemini =
      config.provider === 'openai_compatible' &&
      isGeminiBaseUrl(config.baseUrl)
    if (!openAi && !gemini) return null

    const audio = await loadAudioBytes(args)
    if (!audio || audio.buffer.byteLength > MAX_AUDIO_BYTES) return null

    const text = openAi
      ? await transcribeWithOpenAi(config, audio)
      : await transcribeWithGemini(config, audio)
    return cleanTranscript(text)
  } catch (err) {
    console.warn(
      '[transcribe] inbound audio failed:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
