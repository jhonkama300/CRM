import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getT } from '@/lib/i18n/translate';
import {
  MetricsParamsError,
  parseConversationsQuery,
  rpcConversationFilters,
} from '@/lib/metrics/params';

const t = getT('Api');

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole('admin');
    const query = parseConversationsQuery(new URL(request.url));

    const { data, error } = await supabase.rpc(
      'metricas_conversations',
      rpcConversationFilters(query)
    );

    if (error) {
      console.error('[metrics/conversations] rpc error:', error);
      return NextResponse.json(
        { error: t('metrics.conversationsFailed') },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof MetricsParamsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
