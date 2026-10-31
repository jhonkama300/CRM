import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { validateChannelCredentials } from '@/lib/whatsapp/channel-validation'
import { getPhoneNumberHealth } from '@/lib/whatsapp/meta-api'
import { parseQualityRating } from '@/lib/whatsapp/phone-health'

/**
 * Scheduled channel health sweep.
 *
 * Re-validates every channel's credentials against Meta, refreshes
 * quality/messaging limit, and creates a notification for account
 * admins when a channel transitions from healthy to degraded
 * (disconnected, token rejected, or quality RED).
 *
 * Auth: x-cron-secret / AUTOMATION_CRON_SECRET, same as the other
 * cron endpoints. Run every 6-24h; more often just burns Meta quota.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const { data: channels, error } = await admin
    .from('channels')
    .select('id, account_id, name, phone_number_id, waba_id, access_token, status, quality_rating, last_registration_error')
    .order('created_at', { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let checked = 0
  let degraded = 0
  let notified = 0
  const failures: Array<{ channelId: string; error: string }> = []

  for (const channel of channels ?? []) {
    let status: 'connected' | 'disconnected' = 'connected'
    let quality: string | null = channel.quality_rating ?? null
    let messagingLimit: string | null = null
    let displayPhoneNumber: string | null = null
    let lastError: string | null = null

    try {
      const accessToken = decrypt(channel.access_token)
      const result = await validateChannelCredentials({
        phoneNumberId: channel.phone_number_id,
        wabaId: channel.waba_id,
        accessToken,
      })
      displayPhoneNumber = result.displayPhoneNumber
      try {
        const info = await getPhoneNumberHealth({
          phoneNumberId: channel.phone_number_id,
          accessToken,
        })
        quality = parseQualityRating(info.quality_rating)
        messagingLimit = info.whatsapp_business_manager_messaging_limit ?? null
      } catch {
        // Credentials are valid; quality is best-effort.
      }
    } catch (err) {
      status = 'disconnected'
      lastError = err instanceof Error ? err.message : 'Channel validation failed'
      failures.push({ channelId: channel.id, error: lastError })
    }

    const wasDegraded =
      channel.status !== 'connected' || channel.quality_rating === 'RED'
    const isDegraded = status !== 'connected' || quality === 'RED'

    const { error: updateError } = await admin
      .from('channels')
      .update({
        status,
        quality_rating: quality,
        messaging_limit: messagingLimit,
        display_phone_number: displayPhoneNumber,
        last_checked_at: new Date().toISOString(),
        last_error: lastError,
      })
      .eq('id', channel.id)

    if (updateError) {
      failures.push({ channelId: channel.id, error: updateError.message })
      continue
    }
    checked += 1

    if (isDegraded) degraded += 1
    if (!isDegraded || wasDegraded) continue

    const { data: admins } = await admin
      .from('profiles')
      .select('user_id')
      .eq('account_id', channel.account_id)
      .in('account_role', ['owner', 'admin'])
    if (!admins?.length) continue

    const title =
      quality === 'RED'
        ? `${channel.name}: WhatsApp quality is RED`
        : `${channel.name}: channel disconnected`
    const body =
      lastError ??
      (quality === 'RED'
        ? 'Meta downgraded this number to RED quality. Review recent sends and templates.'
        : 'The credentials could not be validated. Open Channels and run the connection test.')

    const { error: notifyError } = await admin.from('notifications').insert(
      admins.map((row) => ({
        account_id: channel.account_id,
        user_id: row.user_id,
        type: 'channel_health',
        channel_id: channel.id,
        title,
        body,
      })),
    )
    if (!notifyError) notified += admins.length
  }

  return NextResponse.json({ checked, degraded, notified, failures })
}
