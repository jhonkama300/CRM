'use client';

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Clock,
  Inbox,
  MessageCircleQuestion,
  Sparkles,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Card } from '@/components/ui/card';
import { compare } from '@/lib/dashboard/overview';
import type { AccountMetrics } from '@/lib/metrics/overview';
import {
  KpiTile,
  KpiTileSkeleton,
  TargetBar,
} from '@/components/dashboard/kpi-tile';
import { Sparkline } from '@/components/dashboard/sparkline';
import { Skeleton } from '@/components/dashboard/skeleton';
import { useFormatDuration } from '@/components/dashboard/use-format-duration';

export function MetricsKpis({ data }: { data: AccountMetrics | null }) {
  const t = useTranslations('Metrics.summary');
  const format = useFormatter();
  const formatDuration = useFormatDuration();

  if (!data) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <KpiTileSkeleton key={index} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[88px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  const { summary, days, replyTargetMinutes, series } = data;
  const comparisonLabel = [1, 7, 30, 90].includes(days)
    ? t(`vsPrevious.${days}`)
    : t('vsPreviousPeriod');
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 });
  const slaRate = summary.slaRate;
  const target = replyTargetMinutes;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile
          title={t('medianFirst')}
          info={t('medianFirstInfo')}
          value={
            summary.medianFirst == null
              ? t('none')
              : formatDuration(summary.medianFirst)
          }
          change={compare(
            summary.medianFirst,
            summary.medianFirstPrevious,
            true
          )}
          comparisonLabel={comparisonLabel}
          footer={<TargetBar value={summary.medianFirst} target={target} />}
        />
        <KpiTile
          title={t('averageFirst')}
          info={t('averageFirstInfo')}
          value={
            summary.avgFirst == null
              ? t('none')
              : formatDuration(summary.avgFirst)
          }
          change={compare(summary.avgFirst, summary.avgFirstPrevious, true)}
          comparisonLabel={comparisonLabel}
          footer={
            <p className="text-muted-foreground pt-3 text-xs tabular-nums">
              {t('samples', { count: summary.turns })}
            </p>
          }
        />
        <KpiTile
          title={t('p90First')}
          info={t('p90FirstInfo')}
          value={
            summary.p90First == null
              ? t('none')
              : formatDuration(summary.p90First)
          }
          change={compare(summary.p90First, summary.p90FirstPrevious, true)}
          comparisonLabel={comparisonLabel}
          footer={
            <p className="text-muted-foreground pt-3 text-xs">
              {t('target', { minutes: target })}
            </p>
          }
        />
        <KpiTile
          title={t('sla')}
          info={t('slaInfo')}
          value={slaRate == null ? t('none') : percent(slaRate)}
          change={compare(slaRate, summary.slaRatePrevious)}
          comparisonLabel={comparisonLabel}
          footer={
            <p className="text-muted-foreground pt-3 text-xs tabular-nums">
              {t('slaDetail', {
                within: format.number(summary.withinTarget),
                total: format.number(summary.firstResponseCount),
              })}
            </p>
          }
        />
        <KpiTile
          title={t('medianResolution')}
          info={t('medianResolutionInfo')}
          value={
            summary.medianResolution == null
              ? t('none')
              : formatDuration(summary.medianResolution)
          }
          change={compare(
            summary.medianResolution,
            summary.medianResolutionPrevious,
            true
          )}
          comparisonLabel={comparisonLabel}
          footer={
            <p className="text-muted-foreground pt-3 text-xs tabular-nums">
              {t('resolvedCount', { count: summary.resolved })}
            </p>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Snapshot
          icon={<Inbox className="size-4" />}
          label={t('newConversations')}
          value={format.number(summary.newConversations)}
          detail={comparisonLabel}
          spark={series.map((point) => point.newConversations)}
        />
        <Snapshot
          icon={<UserPlus className="size-4" />}
          label={t('newContacts')}
          value={format.number(summary.newContacts)}
          detail={comparisonLabel}
        />
        <Snapshot
          icon={<Clock className="size-4" />}
          label={t('openConversations')}
          value={format.number(summary.openConversations)}
          detail={t('openConversationsInfo')}
        />
        <Snapshot
          icon={<UserCheck className="size-4" />}
          label={t('assigned')}
          value={format.number(summary.assigned)}
          detail={t('assignedInfo')}
        />
        <Snapshot
          icon={<UserCheck className="size-4" />}
          label={t('handled')}
          value={format.number(summary.handled)}
          detail={t('handledInfo')}
        />
        <Snapshot
          icon={<MessageCircleQuestion className="size-4" />}
          label={t('unanswered')}
          value={format.number(summary.unansweredConversations)}
          detail={t('unansweredInfo')}
        />
        <Snapshot
          icon={<AlertTriangle className="size-4" />}
          label={t('pendingCritical')}
          value={format.number(summary.pendingCritical)}
          detail={t('pendingCriticalInfo')}
        />
        <Snapshot
          icon={<Sparkles className="size-4" />}
          label={t('aiReply')}
          value={
            summary.medianAi == null
              ? t('none')
              : formatDuration(summary.medianAi)
          }
          detail={t('aiDetail', { count: summary.aiTurns })}
        />
      </div>
    </div>
  );
}

function Snapshot({
  icon,
  label,
  value,
  detail,
  spark,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  spark?: number[];
}) {
  return (
    <Card size="sm" className="gap-1.5 px-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <span className="text-muted-foreground/80" aria-hidden>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <p className="text-foreground text-xl leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {spark ? (
        <Sparkline values={spark} />
      ) : (
        <p className="text-muted-foreground truncate pt-1 text-[11px]">
          {detail}
        </p>
      )}
    </Card>
  );
}
