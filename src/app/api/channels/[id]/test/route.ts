import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/whatsapp/encryption';
import { validateChannelCredentials } from '@/lib/whatsapp/channel-validation';
import { getPhoneNumberHealth } from '@/lib/whatsapp/meta-api';
import { parseQualityRating } from '@/lib/whatsapp/phone-health';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { accountId } = await requireRole('admin');
    const admin = supabaseAdmin();
    const { id } = await params;

    const { data: channel } = await admin
      .from('channels')
      .select('id, phone_number_id, waba_id, access_token')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    try {
      const accessToken = decrypt(channel.access_token);
      const result = await validateChannelCredentials({
        phoneNumberId: channel.phone_number_id,
        wabaId: channel.waba_id,
        accessToken,
      });
      let quality: string | null = null;
      let messagingLimit: string | null = null;
      try {
        const info = await getPhoneNumberHealth({
          phoneNumberId: channel.phone_number_id,
          accessToken,
        });
        quality = parseQualityRating(info.quality_rating);
        messagingLimit = info.whatsapp_business_manager_messaging_limit ?? null;
      } catch {
        // Health is supplementary. A credentials/subscription success
        // should not be reported as a failed test just because the
        // optional health read timed out.
      }
      await admin
        .from('channels')
        .update({
          status: 'connected',
          display_phone_number: result.displayPhoneNumber,
          quality_rating: quality,
          messaging_limit: messagingLimit,
          last_checked_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', id)
        .eq('account_id', accountId);
      return NextResponse.json({ ok: true, ...result, quality, messagingLimit });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Channel validation failed';
      await admin
        .from('channels')
        .update({
          status: 'disconnected',
          last_checked_at: new Date().toISOString(),
          last_error: message,
        })
        .eq('id', id)
        .eq('account_id', accountId);
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
