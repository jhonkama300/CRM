import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { encrypt } from '@/lib/whatsapp/encryption'
import { validateChannelCredentials } from '@/lib/whatsapp/channel-validation'

const GRAPH = 'https://graph.facebook.com/v21.0'

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

/** Public config for the client-side Facebook SDK button. */
export async function GET() {
  try {
    await requireRole('viewer')
    const appId = process.env.META_APP_ID?.trim() ?? ''
    const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() ?? ''
    return NextResponse.json({
      enabled: Boolean(appId && configId),
      appId: appId || null,
      configId: configId || null,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const body = await request.json().catch(() => null)
    if (!body) return bad('Invalid request body')

    const appId = process.env.META_APP_ID?.trim()
    const rawSecret = process.env.META_APP_SECRET?.trim()
    const appSecret = rawSecret?.split(',')[0]?.trim()
    if (!appId || !appSecret) {
      return bad('Embedded Signup is not configured on this server', 503)
    }

    const code = typeof body.code === 'string' ? body.code.trim() : ''
    const wabaId = typeof body.waba_id === 'string' ? body.waba_id.trim() : ''
    const phoneNumberId =
      typeof body.phone_number_id === 'string' ? body.phone_number_id.trim() : ''
    if (!code) return bad('Missing Meta authorization code')
    if (!/^\d+$/.test(wabaId)) return bad('Missing or invalid WABA ID')
    if (!/^\d+$/.test(phoneNumberId)) return bad('Missing or invalid Phone Number ID')

    const tokenUrl = new URL(`${GRAPH}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('code', code)
    const tokenRes = await fetch(tokenUrl, { signal: AbortSignal.timeout(20_000) })
    const tokenJson = (await tokenRes.json().catch(() => null)) as
      | { access_token?: string; error?: { message?: string; error_user_msg?: string } }
      | null
    if (!tokenRes.ok || !tokenJson?.access_token) {
      return bad(
        tokenJson?.error?.error_user_msg ??
          tokenJson?.error?.message ??
          'Could not exchange the Meta authorization code',
        400,
      )
    }
    const accessToken = tokenJson.access_token

    let validation: Awaited<ReturnType<typeof validateChannelCredentials>>
    try {
      validation = await validateChannelCredentials({
        phoneNumberId,
        wabaId,
        accessToken,
      })
    } catch (err) {
      return bad(
        err instanceof Error ? err.message : 'Could not validate the selected WhatsApp number',
        400,
      )
    }

    const { data: existing } = await supabase
      .from('channels')
      .select('id')
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle()
    if (existing) {
      return bad('This WhatsApp number is already linked to a channel', 409)
    }

    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : validation.verifiedName?.trim() ||
          validation.displayPhoneNumber?.trim() ||
          'WhatsApp'
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('channels')
      .insert({
        account_id: accountId,
        user_id: userId,
        name,
        color: '#25D366',
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        access_token: encrypt(accessToken),
        status: 'connected',
        display_phone_number: validation.displayPhoneNumber,
        registered_at: null,
        last_registration_error: null,
        subscribed_at: now,
        last_checked_at: now,
        last_error: null,
      })
      .select('id, name, color, phone_number_id, waba_id, status, department_id, display_phone_number, quality_rating, registered_at, last_registration_error, subscribed_at, last_checked_at, last_error, created_at')
      .single()

    if (error) return bad(error.message, 500)
    return NextResponse.json({ channel: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
