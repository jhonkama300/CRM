import {
  DEFAULT_METRICS_TIMEZONE,
  METRICS_ATTENTIONS,
  METRICS_PRESETS,
  type MetricsAttention,
  type MetricsFilters,
  type MetricsPreset,
  type MetricsSlaFilter,
  type MetricsSort,
  type MetricsStatusFilter,
} from './overview';

export class MetricsParamsError extends Error {
  readonly status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = 'MetricsParamsError';
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalUuid(value: string | null, field: string): string | null {
  if (!value) return null;
  if (!UUID_RE.test(value)) {
    throw new MetricsParamsError(`${field} must be a valid UUID`);
  }
  return value;
}

function optionalDate(value: string | null, field: string): string | null {
  if (!value) return null;
  if (!DATE_RE.test(value)) {
    throw new MetricsParamsError(`${field} must be YYYY-MM-DD`);
  }
  return value;
}

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseMetricsFilters(url: URL): MetricsFilters {
  const preset = oneOf<MetricsPreset>(
    url.searchParams.get('preset'),
    METRICS_PRESETS,
    'last7'
  );
  const from = optionalDate(url.searchParams.get('from'), 'from');
  const to = optionalDate(url.searchParams.get('to'), 'to');

  if (preset === 'custom' && (!from || !to)) {
    throw new MetricsParamsError('custom ranges require from and to');
  }

  const timeZone =
    url.searchParams.get('tz')?.trim() || DEFAULT_METRICS_TIMEZONE;

  return {
    preset,
    from,
    to,
    timeZone,
    channelId: optionalUuid(url.searchParams.get('channel'), 'channel'),
    agentId: optionalUuid(url.searchParams.get('agent'), 'agent'),
    attention: oneOf<MetricsAttention>(
      url.searchParams.get('attention'),
      METRICS_ATTENTIONS,
      'all'
    ),
  };
}

export interface ParsedConversationsQuery extends MetricsFilters {
  status: MetricsStatusFilter;
  sla: MetricsSlaFilter;
  search: string;
  sort: MetricsSort;
  direction: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export function parseConversationsQuery(url: URL): ParsedConversationsQuery {
  const base = parseMetricsFilters(url);

  const rawLimit = Number(url.searchParams.get('limit'));
  const rawOffset = Number(url.searchParams.get('offset'));

  return {
    ...base,
    status: oneOf<MetricsStatusFilter>(
      url.searchParams.get('status'),
      ['all', 'open', 'pending', 'closed'] as const,
      'all'
    ),
    sla: oneOf<MetricsSlaFilter>(
      url.searchParams.get('sla'),
      ['all', 'met', 'breached', 'unanswered', 'pending', 'critical'] as const,
      'all'
    ),
    search: (url.searchParams.get('search') ?? '').slice(0, 120),
    sort: oneOf<MetricsSort>(
      url.searchParams.get('sort'),
      [
        'last_activity',
        'created',
        'first_response',
        'pending',
        'contact',
      ] as const,
      'last_activity'
    ),
    direction: url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc',
    limit:
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(200, Math.floor(rawLimit))
        : 25,
    offset:
      Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0,
  };
}

export function rpcFilters(filters: MetricsFilters) {
  return {
    p_preset: filters.preset,
    p_from: filters.from,
    p_to: filters.to,
    p_tz: filters.timeZone,
    p_channel_id: filters.channelId,
    p_agent_id: filters.agentId,
    p_attention: filters.attention,
  };
}

export function rpcConversationFilters(query: ParsedConversationsQuery) {
  return {
    ...rpcFilters(query),
    p_status: query.status,
    p_sla: query.sla,
    p_search: query.search || null,
    p_sort: query.sort,
    p_dir: query.direction,
    p_limit: query.limit,
    p_offset: query.offset,
  };
}
