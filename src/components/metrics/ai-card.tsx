'use client';

import type { ReactNode } from 'react';
import { Bot, Sparkles, UserRoundCog, Workflow } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { AccountMetrics } from '@/lib/metrics/overview';
import { Skeleton } from '@/components/dashboard/skeleton';
import { useFormatDuration } from '@/components/dashboard/use-format-duration';

export function AiCard({ data }: { data: AccountMetrics | null }) {
  const t = useTranslations('Metricas.ai');
  const format = useFormatter();
  const formatDuration = useFormatDuration();

  if (!data) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { ai, summary } = data;
  const participation =
    ai.participationRate == null
      ? null
      : format.number(ai.participationRate, {
          style: 'percent',
          maximumFractionDigits: 0,
        });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3">
          <Stat
            icon={<Sparkles className="size-4" />}
            label={t('messages')}
            value={format.number(ai.messages)}
            detail={t('conversationsDetail', {
              count: format.number(ai.conversations),
            })}
          />
          <Stat
            icon={<Bot className="size-4" />}
            label={t('responseTime')}
            value={
              ai.medianMinutes == null
                ? t('none')
                : formatDuration(ai.medianMinutes)
            }
            detail={t('turnsDetail', { count: format.number(ai.turns) })}
          />
          <Stat
            icon={<Workflow className="size-4" />}
            label={t('automationMessages')}
            value={format.number(ai.automationMessages)}
            detail={t('conversationsDetail', {
              count: format.number(ai.automationConversations),
            })}
          />
          <Stat
            icon={<UserRoundCog className="size-4" />}
            label={t('handoffs')}
            value={format.number(ai.humanHandoffs)}
            detail={t('handoffsDetail')}
          />
        </dl>

        <div className="bg-muted/40 rounded-lg p-3">
          <div className="flex items-center justify-between gap-2 text-xs font-medium">
            <span>{t('participation')}</span>
            <span className="tabular-nums">{participation ?? t('none')}</span>
          </div>
          <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{
                width: `${Math.round((ai.participationRate ?? 0) * 100)}%`,
              }}
            />
          </div>
          <p className="text-muted-foreground mt-2 text-[11px] tabular-nums">
            {t('humanVsAi', {
              human: format.number(summary.outboundHuman),
              ai: format.number(summary.outboundAi),
            })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground flex items-center gap-1 text-xs">
        <span aria-hidden>{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="text-foreground mt-0.5 text-base font-semibold tabular-nums">
        {value}
      </dd>
      <p className="text-muted-foreground text-[11px] tabular-nums">{detail}</p>
    </div>
  );
}
