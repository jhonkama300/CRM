import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { encrypt } from '@/lib/whatsapp/encryption';
import { validateChannelCredentials } from '@/lib/whatsapp/channel-validation';
import { registerPhoneNumber } from '@/lib/whatsapp/meta-api';
import { explainMetaError } from '@/lib/whatsapp/meta-error-explain';

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const { data, error } = await supabase
      .from('channels')
      .select('id, account_id, department_id, user_id, source_config_id, name, color, phone_number_id, waba_id, status, display_phone_number, quality_rating, messaging_limit, registered_at, last_registration_error, subscribed_at, last_checked_at, last_error, mirror_inbound_media, created_at, updated_at, department:departments(id,name)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true });
    if (error) return bad(error.message, 500);
    return NextResponse.json({ channels: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    if (!body) return bad('Invalid request body');

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phoneNumberId =
      typeof body.phone_number_id === 'string' ? body.phone_number_id.trim() : '';
    const accessToken =
      typeof body.access_token === 'string' ? body.access_token.trim() : '';
    if (!name) return bad('Channel name is required');
    if (!/^\d+$/.test(phoneNumberId)) return bad('Invalid phone_number_id');
    if (!accessToken) return bad('Access token is required');

    const departmentId: string | null =
      typeof body.department_id === 'string' && body.department_id.trim()
        ? body.department_id.trim()
        : null;
    if (departmentId) {
      const { data: department } = await supabase
        .from('departments')
        .select('id')
        .eq('id', departmentId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (!department) return bad('Department not found', 404);
    }

    const { data: existing } = await supabase
      .from('channels')
      .select('id')
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle();
    if (existing) return bad('This phone_number_id is already linked to a channel', 409);

    const verifyToken =
      typeof body.verify_token === 'string' && body.verify_token.trim()
        ? body.verify_token.trim()
        : null;
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (pin && !/^\d{6}$/.test(pin)) {
      return bad('Two-step verification PIN must be 6 digits');
    }

    let validation: Awaited<ReturnType<typeof validateChannelCredentials>>;
    try {
      validation = await validateChannelCredentials({
        phoneNumberId,
        wabaId:
          typeof body.waba_id === 'string' && body.waba_id.trim()
            ? body.waba_id.trim()
            : null,
        accessToken,
      });
    } catch (err) {
      return bad(
        err instanceof Error ? err.message : 'Could not validate the channel with Meta',
        400,
      );
    }

    let registeredAt: string | null = null;
    let registrationError: string | null = null;
    if (pin) {
      try {
        await registerPhoneNumber({ phoneNumberId, accessToken, pin });
        registeredAt = new Date().toISOString();
      } catch (err) {
        const explained = explainMetaError(err, 'register', {
          phoneNumberId,
          wabaId:
            typeof body.waba_id === 'string' && body.waba_id.trim()
              ? body.waba_id.trim()
              : null,
        });
        registrationError = explained.summary;
      }
    }

    if (registrationError) {
      return bad(registrationError, 400);
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('channels')
      .insert({
        account_id: accountId,
        department_id: departmentId,
        user_id: userId,
        name,
        color:
          typeof body.color === 'string' && body.color.trim()
            ? body.color.trim()
            : '#25D366',
        phone_number_id: phoneNumberId,
        waba_id:
          typeof body.waba_id === 'string' && body.waba_id.trim()
            ? body.waba_id.trim()
            : null,
        access_token: encrypt(accessToken),
        verify_token: verifyToken ? encrypt(verifyToken) : null,
        status: 'connected',
        display_phone_number: validation.displayPhoneNumber,
        registered_at: registeredAt,
        last_registration_error: null,
        subscribed_at: typeof body.waba_id === 'string' && body.waba_id.trim() ? now : null,
        last_checked_at: now,
        last_error: null,
        mirror_inbound_media: body.mirror_inbound_media !== false,
      })
      .select('id, name, color, phone_number_id, waba_id, status, department_id, display_phone_number, quality_rating, registered_at, last_registration_error, subscribed_at, last_checked_at, last_error, created_at')
      .single();

    if (error) return bad(error.message, 500);
    return NextResponse.json({ channel: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
