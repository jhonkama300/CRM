'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import {
  DEFAULT_METRICS_TIMEZONE,
  loadAccountMetrics,
  METRICS_ATTENTIONS,
  METRICS_PRESETS,
  type AccountMetrics,
  type MetricsAttention,
  type MetricsFilters,
  type MetricsPreset,
} from '@/lib/metrics/overview';
import { createClient } from '@/lib/supabase/client';

import { ActivityCard } from '@/components/metrics/activity-card';
import { AgentsCard } from '@/components/metrics/agents-card';
import { AiCard } from '@/components/metrics/ai-card';
import { ChannelsCard } from '@/components/metrics/channels-card';
import { ConversationsTable } from '@/components/metrics/conversations-table';
import { MetricsHeader } from '@/components/metrics/metrics-header';
import { MetricsKpis } from '@/components/metrics/metrics-kpis';
import { ResponseTimeCard } from '@/components/metrics/response-time-card';
import { SlaCard } from '@/components/metrics/sla-card';
import { VolumeCard } from '@/components/metrics/volume-card';

const POLL_MS = 60_000;

export default function MetricasPage() {
  return (
    <Suspense fallback={null}>
      <MetricasPageInner />
    </Suspense>
  );
}

function readFilters(params: URLSearchParams): MetricsFilters {
  const preset = METRICS_PRESETS.includes(params.get('preset') as MetricsPreset)
    ? (params.get('preset') as MetricsPreset)
    : 'last7';
  const attention = METRICS_ATTENTIONS.includes(
    params.get('attention') as MetricsAttention
  )
    ? (params.get('attention') as MetricsAttention)
    : 'all';

  return {
    preset,
    from: params.get('from'),
    to: params.get('to'),
    timeZone: DEFAULT_METRICS_TIMEZONE,
    channelId: params.get('channel'),
    agentId: params.get('agent'),
    attention,
  };
}

function MetricasPageInner() {
  const t = useTranslations('Metricas.page');
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => readFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const { canEditSettings, profileLoading } = useAuth();

  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [metrics, setMetrics] = useState<AccountMetrics | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestRef = useRef(0);

  const { preset, from, to, channelId, agentId, attention, timeZone } = filters;
  const customIncomplete = preset === 'custom' && (!from || !to);
  const filterKey = `${preset}|${from ?? ''}|${to ?? ''}|${channelId ?? ''}|${
    agentId ?? ''
  }|${attention}`;

  const refresh = useCallback(async () => {
    if (!canEditSettings || customIncomplete) return;
    const request = ++requestRef.current;
    setRefreshing(true);
    try {
      const data = await loadAccountMetrics({
        preset,
        from,
        to,
        timeZone,
        channelId,
        agentId,
        attention,
      });
      if (request !== requestRef.current) return;
      setMetrics(data);
      setLoadedKey(filterKey);
      setFailed(false);
      setErrorDetail(null);
    } catch (error) {
      if (request !== requestRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      console.error('[metricas] load failed:', message);
      setErrorDetail(message);
      setFailed(true);
    } finally {
      if (request === requestRef.current) setRefreshing(false);
    }
  }, [
    agentId,
    attention,
    canEditSettings,
    channelId,
    customIncomplete,
    filterKey,
    from,
    preset,
    timeZone,
    to,
  ]);

  useEffect(() => {
    if (!canEditSettings) return;
    void refresh();
  }, [refresh, canEditSettings]);

  useEffect(() => {
    if (!canEditSettings) return;
    void (async () => {
      const { data } = await createClient()
        .from('channels')
        .select('id, name')
        .order('created_at', { ascending: true });
      setChannels(data ?? []);
    })();
    void (async () => {
      try {
        const response = await fetch('/api/account/members');
        if (!response.ok) return;
        const body = (await response.json()) as {
          members?: Array<{ user_id: string; full_name: string | null }>;
        };
        setAgents(
          (body.members ?? []).map((member) => ({
            id: member.user_id,
            name: member.full_name?.trim() || t('unnamedAgent'),
          }))
        );
      } catch {
        // roster is optional for filtering; the channel/range filters still work
      }
    })();
  }, [canEditSettings, t]);

  useEffect(() => {
    if (!canEditSettings) return;
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    return () => window.clearInterval(tick);
  }, [refresh, canEditSettings]);

  const updateFilters = useCallback(
    (next: Partial<MetricsFilters>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...next };

      params.set('preset', merged.preset);
      if (merged.from) params.set('from', merged.from);
      else params.delete('from');
      if (merged.to) params.set('to', merged.to);
      else params.delete('to');
      if (merged.channelId) params.set('channel', merged.channelId);
      else params.delete('channel');
      if (merged.agentId) params.set('agent', merged.agentId);
      else params.delete('agent');
      params.set('attention', merged.attention);

      setFailed(false);
      router.replace(`/metricas?${params.toString()}`, { scroll: false });
    },
    [filters, router, searchParams]
  );

  if (profileLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-muted h-10 w-64 animate-pulse rounded-md" />
        <MetricsKpis data={null} />
      </div>
    );
  }

  if (!canEditSettings) {
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <CardHeader>
          <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
            <ShieldAlert className="size-5" aria-hidden />
          </div>
          <CardTitle className="mt-2">{t('accessDeniedTitle')}</CardTitle>
          <CardDescription>{t('accessDeniedBody')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (failed && !metrics) {
    return (
      <div className="border-border flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <p className="text-muted-foreground text-sm">{t('loadFailed')}</p>
        {errorDetail ? (
          <p className="text-muted-foreground max-w-xl px-6 font-mono text-xs">
            {errorDetail}
          </p>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const data = metrics && loadedKey === filterKey ? metrics : null;

  return (
    <div className="space-y-4">
      <MetricsHeader
        filters={filters}
        channels={channels}
        agents={agents}
        onFiltersChange={updateFilters}
        onRefresh={() => void refresh()}
        refreshing={refreshing}
        generatedAt={data?.generatedAt}
      />

      {customIncomplete ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
          {t('customRangeHint')}
        </p>
      ) : null}

      <MetricsKpis data={data} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ResponseTimeCard data={data} />
        <VolumeCard data={data} />
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <SlaCard data={data} onSaved={() => void refresh()} />
        <AiCard data={data} />
      </div>

      <ActivityCard data={data} />

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <AgentsCard data={data} />
        <ChannelsCard data={data} />
      </div>

      <ConversationsTable filters={filters} />
    </div>
  );
}
