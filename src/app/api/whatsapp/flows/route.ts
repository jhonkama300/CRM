import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { listWhatsAppFlows } from '@/lib/whatsapp/meta-api'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

export async function GET() {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const limit = checkRateLimit(
      `whatsapp-flows:${userId}`,
      RATE_LIMITS.whatsappAdmin,
    )
    if (!limit.success) return rateLimitResponse(limit)

    const { data: config, error } = await supabase
      .from('whatsapp_config')
      .select('waba_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle()

    if (error || !config) {
      return NextResponse.json(
        { error: t('common.whatsappNotConfiguredConnect') },
        { status: 400 },
      )
    }
    if (!config.waba_id) {
      return NextResponse.json(
        { error: t('common.wabaIdMissing') },
        { status: 400 },
      )
    }

    const flows = await listWhatsAppFlows({
      wabaId: config.waba_id,
      accessToken: decrypt(config.access_token),
    })
    return NextResponse.json({ flows })
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      error instanceof ForbiddenError
    ) {
      return toErrorResponse(error)
    }
    console.error('Error listing WhatsApp flows:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : t('templates.syncFailed'),
      },
      { status: 502 },
    )
  }
}
