import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getT } from '@/lib/i18n/translate';

const t = getT('Api');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface EventRow {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const conversationId = new URL(request.url).searchParams.get(
      'conversation'
    );

    if (!conversationId || !UUID_RE.test(conversationId)) {
      return NextResponse.json(
        { error: t('metrics.invalidParams') },
        { status: 400 }
      );
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (convError) {
      console.error(
        '[metrics/conversation-events] conversation error:',
        convError
      );
      return NextResponse.json(
        { error: t('metrics.conversationsFailed') },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: t('metrics.conversationsFailed') },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from('conversation_events')
      .select('id, event_type, actor_user_id, actor_type, metadata, created_at')
      .eq('account_id', accountId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[metrics/conversation-events] events error:', error);
      return NextResponse.json(
        { error: t('metrics.eventsFailed') },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as EventRow[];
    const actorIds = [
      ...new Set(
        rows
          .map((row) => row.actor_user_id)
          .filter((value): value is string => Boolean(value))
      ),
    ];

    const names = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .eq('account_id', accountId)
        .in('user_id', actorIds);
      for (const profile of (profiles ?? []) as Array<{
        user_id: string;
        full_name: string | null;
      }>) {
        if (profile.full_name) names.set(profile.user_id, profile.full_name);
      }
    }

    return NextResponse.json({
      events: rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        actorType: row.actor_type,
        actorName: row.actor_user_id
          ? (names.get(row.actor_user_id) ?? null)
          : null,
        metadata: row.metadata ?? {},
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
