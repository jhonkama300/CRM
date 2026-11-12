export const METRICS_PRESETS = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'last90',
  'this_month',
  'last_month',
  'custom',
] as const;

export type MetricsPreset = (typeof METRICS_PRESETS)[number];

export const METRICS_ATTENTIONS = ['all', 'human', 'ai', 'automation'] as const;

export type MetricsAttention = (typeof METRICS_ATTENTIONS)[number];

export const DEFAULT_METRICS_TIMEZONE = 'America/Bogota';

export interface MetricsFilters {
  preset: MetricsPreset;
  from: string | null;
  to: string | null;
  timeZone: string;
  channelId: string | null;
  agentId: string | null;
  attention: MetricsAttention;
}

export interface MetricsSlaSettings {
  firstResponseMinutes: number;
  betweenMessagesMinutes: number;
  pendingAlertMinutes: number;
  criticalMinutes: number;
  useBusinessHours: boolean;
  timezone: string;
  workdayStart: string;
  workdayEnd: string;
  workdays: number[];
}

export interface MetricsSummary {
  turns: number;
  turnsPrevious: number;
  medianHuman: number | null;
  medianHumanPrevious: number | null;
  avgHuman: number | null;
  avgHumanPrevious: number | null;
  p90Human: number | null;
  p90HumanPrevious: number | null;
  medianFirst: number | null;
  medianFirstPrevious: number | null;
  avgFirst: number | null;
  avgFirstPrevious: number | null;
  p90First: number | null;
  p90FirstPrevious: number | null;
  firstResponseCount: number;
  withinTarget: number;
  slaRate: number | null;
  slaRatePrevious: number | null;
  medianAi: number | null;
  avgAi: number | null;
  aiTurns: number;
  medianResolution: number | null;
  avgResolution: number | null;
  medianResolutionPrevious: number | null;
  newConversations: number;
  newConversationsPrevious: number;
  newContacts: number;
  newContactsPrevious: number;
  resolved: number;
  closed: number;
  resolvedPrevious: number;
  openConversations: number;
  open: number;
  assigned: number;
  unassigned: number;
  handled: number;
  unansweredConversations: number;
  unanswered: number;
  pendingWarning: number;
  pendingCritical: number;
  oldestPendingMinutes: number | null;
  inbound: number;
  outbound: number;
  outboundHuman: number;
  outboundAi: number;
  outboundAutomation: number;
  failed: number;
  delivered: number;
  read: number;
  aiMessages: number;
  aiConversations: number;
  automationMessages: number;
  automationConversations: number;
  aiParticipationRate: number | null;
  humanHandoffs: number;
  activeAgents: number;
  responseAverage: number | null;
  responseMedian: number | null;
  responseP90: number | null;
  responseCount: number;
}

export interface MetricsSeriesPoint {
  t: string;
  incoming: number;
  outgoing: number;
  human: number;
  ai: number;
  automation: number;
  newConversations: number;
  resolved: number;
  replies: number;
  medianHuman: number | null;
  p90Human: number | null;
}

export interface MetricsHourPoint {
  hour: number;
  incoming: number;
  outgoing: number;
  replies: number;
  medianHuman: number | null;
}

export interface MetricsAgent {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  role: string | null;
  assigned: number;
  handled: number;
  resolved: number;
  open: number;
  replies: number;
  conversations: number;
  medianMinutes: number | null;
  avgMinutes: number | null;
  p90Minutes: number | null;
  withinTarget: number;
  firstReplies: number;
  firstMedianMinutes: number | null;
  firstAvgMinutes: number | null;
  firstWithinTarget: number;
  humanMessages: number;
  aiMessages: number;
  automationMessages: number;
}

export interface MetricsChannel {
  channelId: string;
  name: string;
  color: string;
  newConversations: number;
  openConversations: number;
  resolved: number;
  incoming: number;
  outgoing: number;
  human: number;
  ai: number;
  automation: number;
  failed: number;
  replies: number;
  medianMinutes: number | null;
  avgMinutes: number | null;
  p90Minutes: number | null;
  withinTarget: number;
  firstReplies: number;
  firstMedianMinutes: number | null;
  firstAvgMinutes: number | null;
}

export interface MetricsAiBreakdown {
  messages: number;
  conversations: number;
  participationRate: number | null;
  turns: number;
  medianMinutes: number | null;
  avgMinutes: number | null;
  automationMessages: number;
  automationConversations: number;
  humanHandoffs: number;
}

export interface MetricsActivityCell {
  weekday: number;
  hour: number;
  count: number;
}

export interface MetricsActivity {
  matrix: MetricsActivityCell[];
  peakHour: number | null;
  peakWeekday: number | null;
}

export interface MetricsPending {
  total: number;
  warning: number;
  critical: number;
  oldestMinutes: number | null;
}

export interface AccountMetrics {
  generatedAt: string;
  timeZone: string;
  preset: MetricsPreset;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  days: number;
  unit: 'hour' | 'day';
  channelId: string | null;
  agentId: string | null;
  attention: MetricsAttention;
  replyTargetMinutes: number;
  sla: MetricsSlaSettings;
  filters: {
    channelId: string | null;
    agentId: string | null;
    attention: MetricsAttention;
  };
  summary: MetricsSummary;
  series: MetricsSeriesPoint[];
  hourly: MetricsHourPoint[];
  agents: MetricsAgent[];
  channels: MetricsChannel[];
  ai: MetricsAiBreakdown;
  activity: MetricsActivity;
  pending: MetricsPending;
}

export type MetricsStatusFilter = 'all' | 'open' | 'pending' | 'closed';
export type MetricsSlaFilter =
  'all' | 'met' | 'breached' | 'unanswered' | 'pending' | 'critical';
export type MetricsSort =
  'last_activity' | 'created' | 'first_response' | 'pending' | 'contact';

export interface MetricsConversationRow {
  id: string;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  channelId: string | null;
  channelName: string | null;
  channelColor: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  status: 'open' | 'pending' | 'closed';
  attention: 'human' | 'ai' | 'automation' | 'inbound';
  createdAt: string;
  closedAt: string | null;
  lastMessageAt: string | null;
  firstInboundAt: string | null;
  firstHumanReplyAt: string | null;
  firstResponseMinutes: number | null;
  pendingMinutes: number | null;
  slaState:
    'met' | 'breached' | 'unanswered' | 'pending' | 'critical' | 'no_inbound';
  inbound: number;
  humanMessages: number;
  aiMessages: number;
  automationMessages: number;
  failedMessages: number;
}

export interface MetricsConversationsPage {
  total: number;
  limit: number;
  offset: number;
  timeZone: string;
  from: string;
  to: string;
  rows: MetricsConversationRow[];
}

function queryString(filters: MetricsFilters): string {
  const params = new URLSearchParams();
  params.set('preset', filters.preset);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  params.set('tz', filters.timeZone);
  if (filters.channelId) params.set('channel', filters.channelId);
  if (filters.agentId) params.set('agent', filters.agentId);
  params.set('attention', filters.attention);
  return params.toString();
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep status-based message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function loadAccountMetrics(
  filters: MetricsFilters,
  signal?: AbortSignal
): Promise<AccountMetrics> {
  const response = await fetch(
    `/api/metrics/overview?${queryString(filters)}`,
    {
      signal,
      cache: 'no-store',
    }
  );
  return readJson<AccountMetrics>(response);
}

export interface ConversationsQuery extends MetricsFilters {
  status: MetricsStatusFilter;
  sla: MetricsSlaFilter;
  search: string;
  sort: MetricsSort;
  direction: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export async function loadMetricsConversations(
  query: ConversationsQuery,
  signal?: AbortSignal
): Promise<MetricsConversationsPage> {
  const params = new URLSearchParams(queryString(query));
  params.set('status', query.status);
  params.set('sla', query.sla);
  if (query.search) params.set('search', query.search);
  params.set('sort', query.sort);
  params.set('dir', query.direction);
  params.set('limit', String(query.limit));
  params.set('offset', String(query.offset));

  const response = await fetch(`/api/metrics/conversations?${params}`, {
    signal,
    cache: 'no-store',
  });
  return readJson<MetricsConversationsPage>(response);
}

export function exportMetricsUrl(
  query: ConversationsQuery,
  format: 'csv' | 'xls'
): string {
  const params = new URLSearchParams(queryString(query));
  params.set('status', query.status);
  params.set('sla', query.sla);
  if (query.search) params.set('search', query.search);
  params.set('sort', query.sort);
  params.set('dir', query.direction);
  params.set('format', format);
  return `/api/metrics/export?${params}`;
}
