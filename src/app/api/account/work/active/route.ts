// ============================================================
// /api/account/work/active
//
// Lists the teammates with an open shift right now. Work session
// rows are admin-only under RLS, but the roster is useful to every
// member of the account, so this route returns only the public
// fields needed by the header presence card.
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const admin = supabaseAdmin();

    const { data: sessions, error } = await admin
      .from('work_sessions')
      .select('user_id, started_at, break_started_at')
      .eq('account_id', ctx.accountId)
      .is('ended_at', null)
      .order('started_at', { ascending: true });

    if (error) {
      console.error('[GET /api/account/work/active] fetch error:', error);
      return NextResponse.json(
        { error: 'Could not load active workers' },
        { status: 500 }
      );
    }

    const userIds = [...new Set((sessions ?? []).map((row) => row.user_id))];
    if (userIds.length === 0) {
      return NextResponse.json({ workers: [] });
    }

    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', userIds);

    if (profileError) {
      console.error(
        '[GET /api/account/work/active] profile fetch error:',
        profileError
      );
      return NextResponse.json(
        { error: 'Could not load active workers' },
        { status: 500 }
      );
    }

    const profileById = new Map(
      (profiles ?? []).map((profile) => [profile.user_id, profile])
    );

    return NextResponse.json({
      workers: (sessions ?? []).map((session) => {
        const profile = profileById.get(session.user_id);
        return {
          user_id: session.user_id,
          full_name: profile?.full_name ?? '',
          avatar_url: profile?.avatar_url ?? null,
          started_at: session.started_at,
          break_started_at: session.break_started_at,
        };
      }),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
