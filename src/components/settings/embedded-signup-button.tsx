'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, PlugZap } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface SignupConfig {
  enabled: boolean
  appId: string | null
  configId: string | null
}

interface FbLoginResponse {
  authResponse?: { code?: string } | null
  status?: string
}

interface FbSdk {
  init: (options: Record<string, unknown>) => void
  login: (
    callback: (response: FbLoginResponse) => void,
    options: Record<string, unknown>,
  ) => void
}

declare global {
  interface Window {
    FB?: FbSdk
  }
}

interface SessionInfo {
  wabaId: string
  phoneNumberId: string
}

function loadFacebookSdk(): Promise<void> {
  if (window.FB) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('facebook-jssdk')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Facebook SDK failed')), {
        once: true,
      })
      return
    }
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Facebook SDK failed'))
    document.body.appendChild(script)
  })
}

export function EmbeddedSignupButton({ onConnected }: { onConnected: () => void }) {
  const t = useTranslations('Settings.channels')
  const [config, setConfig] = useState<SignupConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const resolvedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/channels/embedded-signup', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) setConfig(body as SignupConfig)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const connect = useCallback(async () => {
    if (!config?.enabled || !config.appId || !config.configId) return
    setBusy(true)
    resolvedRef.current = false

    try {
      await loadFacebookSdk()
      window.FB?.init({
        appId: config.appId,
        cookie: true,
        xfbml: false,
        version: 'v21.0',
      })

      await new Promise<void>((resolve, reject) => {
        let code: string | null = null
        let session: SessionInfo | null = null
        let submitted = false
        const timeout = window.setTimeout(() => {
          cleanup()
          reject(new Error(t('metaTimeout')))
        }, 120_000)

        const cleanup = () => {
          window.clearTimeout(timeout)
          window.removeEventListener('message', onMessage)
        }

        const submit = async () => {
          if (submitted || !code || !session) return
          submitted = true
          resolvedRef.current = true
          cleanup()
          try {
            const res = await fetch('/api/channels/embedded-signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code,
                waba_id: session.wabaId,
                phone_number_id: session.phoneNumberId,
              }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error ?? t('saveFailed'))
            toast.success(t('created'))
            onConnected()
            resolve()
          } catch (err) {
            reject(err instanceof Error ? err : new Error(t('saveFailed')))
          }
        }

        const onMessage = (event: MessageEvent) => {
          if (event.origin !== 'https://www.facebook.com') return
          const payload = event.data as {
            type?: string
            event?: string
            data?: { waba_id?: string; phone_number_id?: string }
          }
          if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return
          if (payload.event === 'CANCEL' || payload.event === 'ERROR') {
            cleanup()
            reject(new Error(t('metaCancelled')))
            return
          }
          if (payload.event !== 'FINISH') return
          const wabaId = payload.data?.waba_id
          const phoneNumberId = payload.data?.phone_number_id
          if (!wabaId || !phoneNumberId) return
          session = { wabaId, phoneNumberId }
          void submit()
        }

        window.addEventListener('message', onMessage)
        window.FB?.login(
          (response) => {
            if (resolvedRef.current) return
            const authCode = response.authResponse?.code
            if (!authCode) {
              cleanup()
              reject(new Error(t('metaCancelled')))
              return
            }
            code = authCode
            void submit()
          },
          {
            config_id: config.configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {} },
          },
        )
      })
    } catch (err) {
      if (!resolvedRef.current) {
        toast.error(err instanceof Error ? err.message : t('saveFailed'))
      }
    } finally {
      setBusy(false)
    }
  }, [config, onConnected, t])

  if (!config?.enabled) return null

  return (
    <Button
      variant="outline"
      onClick={() => void connect()}
      disabled={busy}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <PlugZap className="h-4 w-4" />
      )}
      {busy ? t('connecting') : t('connectWithMeta')}
    </Button>
  )
}
