import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const [channelRes, aiRes, configRes] = await Promise.all([
      supabase
        .from('channels')
        .select('id, name, status, display_phone_number, quality_rating, registered_at, last_checked_at, last_error')
        .eq('account_id', accountId),
      supabase
        .from('ai_configs')
        .select('provider, model, is_active, auto_reply_enabled')
        .eq('account_id', accountId)
        .maybeSingle(),
      supabase
        .from('whatsapp_config')
        .select('id, status')
        .eq('account_id', accountId)
        .maybeSingle(),
    ]);

    const channels = channelRes.data ?? [];
    return NextResponse.json({
      whatsapp: {
        configured: !!configRes.data || channels.length > 0,
        connected:
          channels.length > 0
            ? channels.every((c) => c.status === 'connected')
            : configRes.data?.status === 'connected',
        channels: channels.length,
        failed: channels.filter((c) => c.status !== 'connected').length,
      },
      ai: aiRes.data
        ? {
            configured: true,
            active: aiRes.data.is_active,
            autoReply: aiRes.data.auto_reply_enabled,
            provider: aiRes.data.provider,
            model: aiRes.data.model,
          }
        : { configured: false, active: false, autoReply: false },
      cron: { configured: !!process.env.AUTOMATION_CRON_SECRET },
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
      channels,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
