import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { loadAccountMetaCredentials } from '@/lib/whatsapp/account-credentials'
import { getPhoneNumberHealth } from '@/lib/whatsapp/meta-api'
import {
  parseMessagingLimit,
  parseQualityRating,
  type PhoneHealth,
} from '@/lib/whatsapp/phone-health'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

const CACHE_HEADERS = { 'Cache-Control': 'private, max-age=300' }

function reply(body: PhoneHealth) {
  return NextResponse.json(body, { headers: CACHE_HEADERS })
}

const EMPTY: Omit<PhoneHealth, 'state'> = {
  displayPhoneNumber: null,
  quality: 'UNKNOWN',
  limit: null,
}

export async function GET() {
  try {
    const { supabase, accountId, userId } = await getCurrentAccount()

    const limit = checkRateLimit(`whatsapp-health:${userId}`, RATE_LIMITS.whatsappHealth)
    if (!limit.success) return rateLimitResponse(limit)

    let credentials
    try {
      credentials = await loadAccountMetaCredentials(supabase, accountId)
    } catch {
      return reply({ state: 'disconnected', ...EMPTY })
    }

    try {
      const info = await getPhoneNumberHealth({
        phoneNumberId: credentials.phoneNumberId,
        accessToken: credentials.accessToken,
      })
      return reply({
        state: 'connected',
        displayPhoneNumber: info.display_phone_number ?? null,
        quality: parseQualityRating(info.quality_rating),
        limit: parseMessagingLimit(info.whatsapp_business_manager_messaging_limit),
      })
    } catch (err) {
      console.error('[whatsapp/health] lookup failed:', err instanceof Error ? err.message : err)
      return reply({ state: 'unavailable', ...EMPTY })
    }
  } catch (err) {
    return toErrorResponse(err)
  }
}
