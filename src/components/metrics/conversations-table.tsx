'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  History,
  Search,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  exportMetricsUrl,
  loadMetricsConversations,
  type MetricsConversationRow,
  type MetricsConversationsPage,
  type MetricsFilters,
  type MetricsSlaFilter,
  type MetricsSort,
  type MetricsStatusFilter,
} from '@/lib/metrics/overview';
import { Skeleton } from '@/components/dashboard/skeleton';
import { useFormatDuration } from '@/components/dashboard/use-format-duration';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

const STATUSES: MetricsStatusFilter[] = ['all', 'open', 'pending', 'closed'];
const SLA_FILTERS: MetricsSlaFilter[] = [
  'all',
  'met',
  'breached',
  'unanswered',
  'pending',
  'critical',
];

export function ConversationsTable({ filters }: { filters: MetricsFilters }) {
  const t = useTranslations('Metricas.conversations');
  const format = useFormatter();
  const formatDuration = useFormatDuration();

  const [status, setStatus] = useState<MetricsStatusFilter>('all');
  const [sla, setSla] = useState<MetricsSlaFilter>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [sort, setSort] = useState<MetricsSort>('last_activity');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  const [data, setData] = useState<MetricsConversationsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [
    filters.preset,
    filters.from,
    filters.to,
    filters.channelId,
    filters.agentId,
    filters.attention,
    status,
    sla,
    appliedSearch,
    sort,
    direction,
  ]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadMetricsConversations({
        ...filters,
        status,
        sla,
        search: appliedSearch,
        sort,
        direction,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (request !== requestRef.current) return;
      setData(next);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [appliedSearch, direction, filters, page, sla, sort, status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportQuery = {
    ...filters,
    status,
    sla,
    search: appliedSearch,
    sort,
    direction,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const sortItems: Array<{ value: MetricsSort; label: string }> = [
    { value: 'last_activity', label: t('sort.last_activity') },
    { value: 'created', label: t('sort.created') },
    { value: 'first_response', label: t('sort.first_response') },
    { value: 'pending', label: t('sort.pending') },
    { value: 'contact', label: t('sort.contact') },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction className="flex flex-wrap items-center gap-2">
          <a
            href={exportMetricsUrl(exportQuery, 'csv')}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Download className="size-4" aria-hidden />
            CSV
          </a>
          <a
            href={exportMetricsUrl(exportQuery, 'xls')}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            Excel
          </a>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 px-2">
        <div className="flex flex-wrap items-center gap-2 px-2">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select
            value={status}
            items={STATUSES.map((value) => ({
              value,
              label: t(`status.${value}`),
            }))}
            onValueChange={(value) => setStatus(value as MetricsStatusFilter)}
          >
            <SelectTrigger className="bg-card h-8 w-[135px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`status.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sla}
            items={SLA_FILTERS.map((value) => ({
              value,
              label: t(`slaFilter.${value}`),
            }))}
            onValueChange={(value) => setSla(value as MetricsSlaFilter)}
          >
            <SelectTrigger className="bg-card h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLA_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`slaFilter.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            items={sortItems}
            onValueChange={(value) => setSort(value as MetricsSort)}
          >
            <SelectTrigger className="bg-card h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
            }
          >
            {direction === 'asc' ? t('direction.asc') : t('direction.desc')}
          </Button>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-muted-foreground text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t('retry')}
            </Button>
          </div>
        ) : loading && !data ? (
          <Skeleton className="mx-2 h-64 w-[calc(100%-1rem)]" />
        ) : !data || data.rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {t('empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.contact')}</TableHead>
                  <TableHead>{t('columns.channel')}</TableHead>
                  <TableHead>{t('columns.agent')}</TableHead>
                  <TableHead>{t('columns.status')}</TableHead>
                  <TableHead>{t('columns.attention')}</TableHead>
                  <TableHead className="text-right">
                    {t('columns.created')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('columns.firstResponse')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('columns.pending')}
                  </TableHead>
                  <TableHead>{t('columns.sla')}</TableHead>
                  <TableHead className="w-8">
                    <span className="sr-only">{t('columns.history')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    formatDate={(value) =>
                      value
                        ? format.dateTime(new Date(value), {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : t('none')
                    }
                    formatDuration={formatDuration}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
          <p className="text-muted-foreground text-xs tabular-nums">
            {t('pagination', {
              from: total === 0 ? 0 : page * PAGE_SIZE + 1,
              to: Math.min(total, (page + 1) * PAGE_SIZE),
              total,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
              {t('previous')}
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums">
              {page + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('next')}
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  row,
  formatDate,
  formatDuration,
}: {
  row: MetricsConversationRow;
  formatDate: (value: string | null) => string;
  formatDuration: (minutes: number) => string;
}) {
  const t = useTranslations('Metricas.conversations');
  const name = row.contactName || row.contactPhone || t('unnamedContact');
  const sla = row.slaState;

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/inbox?c=${row.id}`}
          className="hover:text-primary block max-w-[220px] truncate font-medium"
        >
          {name}
        </Link>
        {row.contactPhone ? (
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {row.contactPhone}
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: row.channelColor ?? 'var(--muted)' }}
            aria-hidden
          />
          {row.channelName ?? t('none')}
        </span>
      </TableCell>
      <TableCell className="max-w-[160px] truncate text-xs">
        {row.assignedAgentName ?? t('unassigned')}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {t(`status.${row.status}`)}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="capitalize">
          {t(`attention.${row.attention}`)}
        </Badge>
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {formatDate(row.createdAt)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right text-xs tabular-nums',
          sla === 'breached' && 'text-destructive'
        )}
      >
        {row.firstResponseMinutes == null
          ? t('none')
          : formatDuration(row.firstResponseMinutes)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right text-xs tabular-nums',
          (sla === 'pending' || sla === 'critical') && 'text-destructive'
        )}
      >
        {row.pendingMinutes == null
          ? t('none')
          : t('pendingValue', { minutes: Math.round(row.pendingMinutes) })}
      </TableCell>
      <TableCell>
        <Badge
          variant={
            sla === 'critical' || sla === 'breached' ? 'destructive' : 'outline'
          }
          className={cn(
            'capitalize',
            sla === 'met' && 'text-emerald-600 dark:text-emerald-400',
            sla === 'pending' && 'text-amber-600 dark:text-amber-400'
          )}
        >
          {t(`slaState.${sla}`)}
        </Badge>
      </TableCell>
      <TableCell>
        <ConversationHistoryDialog conversationId={row.id} />
      </TableCell>
    </TableRow>
  );
}

interface ConversationEvent {
  id: string;
  eventType: string;
  actorType: string;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

function ConversationHistoryDialog({
  conversationId,
}: {
  conversationId: string;
}) {
  const t = useTranslations('Metricas.conversations.history');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ConversationEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setLoading(true);
      setError(null);
      setEvents(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(
      `/api/metrics/conversation-events?conversation=${encodeURIComponent(conversationId)}`,
      { signal: controller.signal, cache: 'no-store' }
    )
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? t('loadFailed'));
        }
        return (await response.json()) as { events: ConversationEvent[] };
      })
      .then((body) => {
        if (!controller.signal.aborted) setEvents(body.events ?? []);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : t('loadFailed'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [conversationId, open, t]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm">
            <History className="size-4" aria-hidden />
            <span className="sr-only">{t('button')}</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : error ? (
            <div className="space-y-2 py-4 text-center">
              <p className="text-muted-foreground text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
              >
                {t('close')}
              </Button>
            </div>
          ) : !events || events.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t('empty')}
            </p>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="border-border border-b pb-2 last:border-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-foreground text-xs font-medium">
                    {t(`events.${event.eventType}`)}
                  </p>
                  <time className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                    {format.dateTime(new Date(event.createdAt), {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  {event.actorName ?? t(`actor.${event.actorType}`)}
                </p>
              </div>
            ))
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
