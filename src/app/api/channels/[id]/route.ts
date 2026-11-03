import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import { validateChannelCredentials } from '@/lib/whatsapp/channel-validation';
import { registerPhoneNumber } from '@/lib/whatsapp/meta-api';
import { explainMetaError } from '@/lib/whatsapp/meta-error-explain';
import { recordAudit } from '@/lib/audit/log';

type Params = { params: Promise<{ id: string }> };

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return bad('Invalid request body');

    const { data: existing } = await supabase
      .from('channels')
      .select('id, phone_number_id, waba_id, access_token, registered_at')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (!existing) return bad('Channel not found', 404);

    const patch: Record<string, unknown> = {};
    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return bad('Channel name is required');
      patch.name = name;
    }
    if ('color' in body && typeof body.color === 'string') {
      patch.color = body.color.trim() || '#25D366';
    }
    if ('waba_id' in body) {
      patch.waba_id =
        typeof body.waba_id === 'string' && body.waba_id.trim()
          ? body.waba_id.trim()
          : null;
    }
    if ('department_id' in body) {
      const departmentId =
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
      patch.department_id = departmentId;
    }
    if ('access_token' in body) {
      const token = typeof body.access_token === 'string' ? body.access_token.trim() : '';
      if (!token) return bad('Access token is required');
      patch.access_token = encrypt(token);
      patch.status = 'connected';
    }
    if ('verify_token' in body) {
      const token = typeof body.verify_token === 'string' ? body.verify_token.trim() : '';
      patch.verify_token = token ? encrypt(token) : null;
    }
    if (typeof body.mirror_inbound_media === 'boolean') {
      patch.mirror_inbound_media = body.mirror_inbound_media;
    }

    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (pin && !/^\d{6}$/.test(pin)) {
      return bad('Two-step verification PIN must be 6 digits');
    }

    const changedCredentials =
      'access_token' in body || 'waba_id' in body;
    if (changedCredentials) {
      const nextWaba =
        'waba_id' in body
          ? (typeof body.waba_id === 'string' && body.waba_id.trim()
              ? body.waba_id.trim()
              : null)
          : (existing.waba_id ?? null);
      const plainToken =
        typeof body.access_token === 'string' && body.access_token.trim()
          ? body.access_token.trim()
          : decrypt(existing.access_token);
      try {
        const validation = await validateChannelCredentials({
          phoneNumberId: existing.phone_number_id,
          wabaId: nextWaba,
          accessToken: plainToken,
        });
        patch.display_phone_number = validation.displayPhoneNumber;
        patch.subscribed_at = nextWaba ? new Date().toISOString() : null;
      } catch (err) {
        return bad(
          err instanceof Error ? err.message : 'Could not validate the channel with Meta',
          400,
        );
      }
      patch.status = 'connected';
      patch.last_checked_at = new Date().toISOString();
      patch.last_error = null;
    }

    let registrationError: string | null = null;
    if (pin) {
      const plainToken =
        typeof body.access_token === 'string' && body.access_token.trim()
          ? body.access_token.trim()
          : decrypt(existing.access_token);
      const wabaId =
        'waba_id' in body
          ? (typeof body.waba_id === 'string' && body.waba_id.trim()
              ? body.waba_id.trim()
              : null)
          : (existing.waba_id ?? null);
      try {
        await registerPhoneNumber({
          phoneNumberId: existing.phone_number_id,
          accessToken: plainToken,
          pin,
        });
        patch.registered_at = new Date().toISOString();
        patch.last_registration_error = null;
        patch.status = 'connected';
      } catch (err) {
        const explained = explainMetaError(err, 'register', {
          phoneNumberId: existing.phone_number_id,
          wabaId,
        });
        registrationError = explained.summary;
        patch.registered_at = null;
        patch.last_registration_error = registrationError;
        patch.status = 'disconnected';
      }
    }

    if (Object.keys(patch).length === 0) return bad('Nothing to update');

    const { data, error } = await supabase
      .from('channels')
      .update(patch)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('id, name, color, phone_number_id, waba_id, status, department_id, display_phone_number, quality_rating, messaging_limit, registered_at, last_registration_error, subscribed_at, last_checked_at, last_error, updated_at')
      .maybeSingle();
    if (error) return bad(error.message, 500);
    if (!data) return bad('Channel not found', 404);
    await recordAudit({
      accountId,
      actorUserId: userId,
      action: 'channel.updated',
      entityType: 'channel',
      entityId: data.id,
      metadata: { name: data.name, fields: Object.keys(patch) },
    });
    if (registrationError) {
      return NextResponse.json(
        { channel: data, error: registrationError },
        { status: 400 },
      );
    }
    return NextResponse.json({ channel: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const { id } = await params;
    const { data, error } = await supabase
      .from('channels')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)
      .select('id, name')
      .maybeSingle();
    if (error) return bad(error.message, 500);
    if (!data) return bad('Channel not found', 404);
    await recordAudit({
      accountId,
      actorUserId: userId,
      action: 'channel.deleted',
      entityType: 'channel',
      entityId: data.id,
      metadata: { name: data.name },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
