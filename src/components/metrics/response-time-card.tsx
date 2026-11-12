'use client';

import { Timer } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { BarChart } from '@/components/tremor/bar-chart';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { bucketDate } from '@/lib/dashboard/overview';
import type { AccountMetrics } from '@/lib/metrics/overview';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Skeleton } from '@/components/dashboard/skeleton';
import { useFormatDuration } from '@/components/dashboard/use-format-duration';

export function ResponseTimeCard({ data }: { data: AccountMetrics | null }) {
  const t = useTranslations('Metrics.response');
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
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const byHour = data.unit === 'hour';
  const points = data.series.filter(
    (point) => point.replies > 0 && point.medianHuman != null
  );
  const totalReplies = data.summary.firstResponseCount;

  const chartData = points.map((point) => {
    const date = bucketDate(point.t);
    return {
      label: byHour
        ? format.dateTime(date, { hour: 'numeric' })
        : format.dateTime(
            date,
            data.days <= 7
              ? { weekday: 'short' }
              : { day: 'numeric', month: 'short' }
          ),
      [t('median')]: Math.round((point.medianHuman ?? 0) * 10) / 10,
      [t('p90')]: Math.round((point.p90Human ?? 0) * 10) / 10,
    };
  });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {points.length === 0 ? (
          <EmptyState
            icon={Timer}
            title={t('empty')}
            hint={t('emptyHint')}
            className="flex-1"
          />
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-x-6 gap-y-2">
              <Stat
                label={t('median')}
                value={
                  data.summary.medianFirst == null
                    ? t('none')
                    : formatDuration(data.summary.medianFirst)
                }
              />
              <Stat
                label={t('p90')}
                value={
                  data.summary.p90First == null
                    ? t('none')
                    : formatDuration(data.summary.p90First)
                }
              />
              <Stat
                label={t('samplesLabel')}
                value={format.number(totalReplies)}
              />
            </dl>
            <BarChart
              className="min-h-[240px] flex-1"
              data={chartData}
              index="label"
              categories={[t('median'), t('p90')]}
              colors={['teal', 'violet']}
              yAxisWidth={44}
              legendPosition="right"
              valueFormatter={(value) => formatDuration(value)}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-base font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}
