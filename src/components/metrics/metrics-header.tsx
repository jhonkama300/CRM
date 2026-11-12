'use client';

import { useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  METRICS_ATTENTIONS,
  METRICS_PRESETS,
  type MetricsAttention,
  type MetricsFilters,
  type MetricsPreset,
} from '@/lib/metrics/overview';

export function MetricsHeader({
  filters,
  channels,
  agents,
  onFiltersChange,
  onRefresh,
  refreshing,
  generatedAt,
}: {
  filters: MetricsFilters;
  channels: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
  onFiltersChange: (next: Partial<MetricsFilters>) => void;
  onRefresh: () => void;
  refreshing: boolean;
  generatedAt?: string | null;
}) {
  const t = useTranslations('Metricas.filters');
  const [customFrom, setCustomFrom] = useState(filters.from ?? '');
  const [customTo, setCustomTo] = useState(filters.to ?? '');

  const generatedLabel = generatedAt
    ? new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(generatedAt))
    : null;

  const presetItems = METRICS_PRESETS.map((preset) => ({
    value: preset,
    label: t(`preset.${preset}`),
  }));

  const agentItems = [
    { value: '__all__', label: t('allAgents') },
    ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
  ];

  const channelItems = [
    { value: '__all__', label: t('allChannels') },
    ...channels.map((channel) => ({ value: channel.id, label: channel.name })),
  ];

  const attentionItems = METRICS_ATTENTIONS.map((attention) => ({
    value: attention,
    label: t(`attention.${attention}`),
  }));

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    onFiltersChange({ preset: 'custom', from: customFrom, to: customTo });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-foreground flex items-center gap-2 text-xl font-semibold tracking-tight">
            <BarChart3 className="text-primary size-5" aria-hidden />
            {t('title')}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('description')}
          </p>
          {generatedLabel ? (
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              {t('updatedAt', { time: generatedLabel })}
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={refreshing ? 'size-4 animate-spin' : 'size-4'}
            aria-hidden
          />
          {refreshing ? t('refreshing') : t('refresh')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.preset}
          items={presetItems}
          onValueChange={(value) => {
            const preset = value as MetricsPreset;
            if (preset === 'custom') {
              onFiltersChange({ preset });
            } else {
              onFiltersChange({ preset, from: null, to: null });
            }
          }}
        >
          <SelectTrigger className="bg-card h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presetItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filters.preset === 'custom' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              type="date"
              className="h-8 w-[145px] text-xs"
              value={customFrom}
              max={customTo || undefined}
              onChange={(event) => setCustomFrom(event.target.value)}
              aria-label={t('from')}
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="date"
              className="h-8 w-[145px] text-xs"
              value={customTo}
              min={customFrom || undefined}
              onChange={(event) => setCustomTo(event.target.value)}
              aria-label={t('to')}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!customFrom || !customTo}
              onClick={applyCustom}
            >
              {t('apply')}
            </Button>
          </div>
        ) : null}

        <Select
          value={filters.channelId ?? '__all__'}
          items={channelItems}
          onValueChange={(value) =>
            onFiltersChange({
              channelId: !value || value === '__all__' ? null : value,
            })
          }
        >
          <SelectTrigger
            className="bg-card h-8 w-[170px] text-xs"
            aria-label={t('channelLabel')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {channelItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.agentId ?? '__all__'}
          items={agentItems}
          onValueChange={(value) =>
            onFiltersChange({
              agentId: !value || value === '__all__' ? null : value,
            })
          }
        >
          <SelectTrigger
            className="bg-card h-8 w-[170px] text-xs"
            aria-label={t('agentLabel')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agentItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.attention}
          items={attentionItems}
          onValueChange={(value) =>
            onFiltersChange({ attention: value as MetricsAttention })
          }
        >
          <SelectTrigger
            className="bg-card h-8 w-[170px] text-xs"
            aria-label={t('attentionLabel')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {attentionItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
