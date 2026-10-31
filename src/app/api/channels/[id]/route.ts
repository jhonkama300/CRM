import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { encrypt } from '@/lib/whatsapp/encryption';

type Params = { params: Promise<{ id: string }> };

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return bad('Invalid request body');

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

    if (Object.keys(patch).length === 0) return bad('Nothing to update');

    const { data, error } = await supabase
      .from('channels')
      .update(patch)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('id, name, color, phone_number_id, waba_id, status, department_id, updated_at')
      .maybeSingle();
    if (error) return bad(error.message, 500);
    if (!data) return bad('Channel not found', 404);
    return NextResponse.json({ channel: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { id } = await params;
    const { error } = await supabase
      .from('channels')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
