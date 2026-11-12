import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getT } from '@/lib/i18n/translate';
import {
  MetricsParamsError,
  parseConversationsQuery,
  rpcConversationFilters,
} from '@/lib/metrics/params';
import type { MetricsConversationRow } from '@/lib/metrics/overview';

const t = getT('Api');

const EXPORT_LIMIT = 5000;

const HEADERS = [
  'Conversación',
  'Contacto',
  'Teléfono',
  'Canal',
  'Agente asignado',
  'Estado',
  'Tipo de atención',
  'Creada',
  'Cerrada',
  'Último mensaje',
  'Primera entrada',
  'Primera respuesta',
  'Primera respuesta (min)',
  'Espera actual (min)',
  'SLA',
  'Entrantes',
  'Salientes humanos',
  'Salientes IA',
  'Salientes automáticos',
  'Fallidos',
];

function rowValues(row: MetricsConversationRow): Array<string | number | null> {
  return [
    row.id,
    row.contactName ?? '',
    row.contactPhone ?? '',
    row.channelName ?? '',
    row.assignedAgentName ?? '',
    row.status,
    row.attention,
    row.createdAt,
    row.closedAt ?? '',
    row.lastMessageAt ?? '',
    row.firstInboundAt ?? '',
    row.firstHumanReplyAt ?? '',
    row.firstResponseMinutes == null
      ? ''
      : Math.round(row.firstResponseMinutes * 10) / 10,
    row.pendingMinutes == null ? '' : Math.round(row.pendingMinutes),
    row.slaState,
    row.inbound,
    row.humanMessages,
    row.aiMessages,
    row.automationMessages,
    row.failedMessages,
  ];
}

function csvCell(value: string | number | null): string {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function htmlCell(value: string | number | null): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole('admin');
    const url = new URL(request.url);
    const query = parseConversationsQuery(url);
    const format = url.searchParams.get('format') === 'xls' ? 'xls' : 'csv';

    const { data, error } = await supabase.rpc('metricas_conversations', {
      ...rpcConversationFilters(query),
      p_limit: EXPORT_LIMIT,
      p_offset: 0,
    });

    if (error) {
      console.error('[metrics/export] rpc error:', error);
      return NextResponse.json(
        { error: t('metrics.exportFailed') },
        { status: 500 }
      );
    }

    const rows = ((data as { rows?: MetricsConversationRow[] } | null)?.rows ??
      []) as MetricsConversationRow[];

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'xls') {
      const body = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8" /><style>table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 6px;font-family:Arial,sans-serif;font-size:12px}th{background:#f2f2f2;font-weight:bold}</style></head><body><table><thead><tr>${HEADERS.map(
        (header) => `<th>${htmlCell(header)}</th>`
      ).join('')}</tr></thead><tbody>${rows
        .map(
          (row) =>
            `<tr>${rowValues(row)
              .map((value) => `<td>${htmlCell(value)}</td>`)
              .join('')}</tr>`
        )
        .join('')}</tbody></table></body></html>`;

      return new NextResponse(body, {
        headers: {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Content-Disposition': `attachment; filename="metricas-${stamp}.xls"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const lines = [
      HEADERS.map(csvCell).join(','),
      ...rows.map((row) => rowValues(row).map(csvCell).join(',')),
    ];
    const body = `\uFEFF${lines.join('\r\n')}`;

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="metricas-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof MetricsParamsError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return toErrorResponse(err);
  }
}
