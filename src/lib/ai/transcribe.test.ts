import { describe, expect, it } from 'vitest'
import {
  extractGeminiText,
  geminiGenerateUrl,
  geminiTranscriptionModels,
  isGeminiBaseUrl,
} from './transcribe'

describe('geminiGenerateUrl', () => {
  it('derives the native endpoint from the OpenAI-compatible base URL', () => {
    expect(
      geminiGenerateUrl(
        'https://generativelanguage.googleapis.com/v1beta/openai',
        'gemini-3.1-flash-lite',
      ),
    ).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    )
  })

  it('handles a trailing slash', () => {
    expect(
      geminiGenerateUrl(
        'https://generativelanguage.googleapis.com/v1beta/openai/',
        'gemini-2.5-flash',
      ),
    ).toContain('/v1beta/models/gemini-2.5-flash:generateContent')
  })
})

describe('geminiTranscriptionModels', () => {
  it('keeps the configured model first and adds stable fallbacks', () => {
    expect(geminiTranscriptionModels('gemini-3.1-flash-lite')).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
    ])
  })

  it('does not duplicate a model already in the fallback list', () => {
    expect(geminiTranscriptionModels('gemini-2.5-flash')).toEqual([
      'gemini-2.5-flash',
      'gemini-3.5-flash',
    ])
  })
})

describe('isGeminiBaseUrl', () => {
  it('matches the Gemini host only', () => {
    expect(
      isGeminiBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai'),
    ).toBe(true)
    expect(isGeminiBaseUrl('https://api.openai.com/v1')).toBe(false)
    expect(isGeminiBaseUrl(null)).toBe(false)
  })
})

describe('extractGeminiText', () => {
  it('joins every text part and trims the result', () => {
    expect(
      extractGeminiText({
        candidates: [
          {
            content: {
              parts: [{ text: ' Hola ' }, { text: 'mundo ' }],
            },
          },
        ],
      }),
    ).toBe('Hola mundo')
  })

  it('returns null when there is no usable text', () => {
    expect(extractGeminiText({ candidates: [] })).toBeNull()
    expect(extractGeminiText(null)).toBeNull()
  })
})
