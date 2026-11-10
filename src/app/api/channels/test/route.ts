import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/whatsapp/encryption';
import { validateChannelCredentials } from '@/lib/whatsapp/channel-validation';

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    if (!body) return bad('Invalid request body');

    const channelId =
      typeof body.channel_id === 'string' && body.channel_id.trim()
        ? body.channel_id.trim()
        : null;
    let phoneNumberId =
      typeof body.phone_number_id === 'string'
        ? body.phone_number_id.trim()
        : '';
    let wabaId =
      typeof body.waba_id === 'string' && body.waba_id.trim()
        ? body.waba_id.trim()
        : null;
    let accessToken =
      typeof body.access_token === 'string' ? body.access_token.trim() : '';

    if (!accessToken && channelId) {
      const { data: channel } = await supabaseAdmin()
        .from('channels')
        .select('phone_number_id, waba_id, access_token')
        .eq('id', channelId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (!channel) return bad('Channel not found', 404);
      phoneNumberId = phoneNumberId || channel.phone_number_id;
      wabaId = wabaId ?? channel.waba_id;
      accessToken = decrypt(channel.access_token);
    }

    if (!phoneNumberId || !accessToken) {
      return bad('Phone Number ID and access token are required');
    }
    if (!/^\d+$/.test(phoneNumberId)) {
      return bad('Phone Number ID must contain only digits');
    }
    if (wabaId && !/^\d+$/.test(wabaId)) {
      return bad('WABA ID must contain only digits');
    }

    const result = await validateChannelCredentials({
      phoneNumberId,
      wabaId,
      accessToken,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Error && !('status' in err)) {
      return bad(err.message, 400);
    }
    return toErrorResponse(err);
  }
}
