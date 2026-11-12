'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { BarChart } from '@/components/tremor/bar-chart';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { bucketDate, ratio } from '@/lib/dashboard/overview';
import type { AccountMetrics } from '@/lib/metrics/overview';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Skeleton } from '@/components/dashboard/skeleton';

type View = 'time' | 'hours';

export function VolumeCard({ data }: { data: AccountMetrics | null }) {
  const t = useTranslations('Metrics.volume');
  const format = useFormatter();
  const [view, setView] = useState<View>('time');

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
  const totalIn = data.series.reduce((sum, point) => sum + point.incoming, 0);
  const totalOut = data.series.reduce((sum, point) => sum + point.outgoing, 0);
  const deliveryRate = ratio(data.summary.delivered, data.summary.outbound);
  const readRate = ratio(data.summary.read, data.summary.delivered);

  const timeData = data.series.map((point) => {
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
      [t('incoming')]: point.incoming,
      [t('outgoing')]: point.outgoing,
    };
  });

  const hoursData = data.hourly.map((point) => ({
    label: format.dateTime(new Date(2000, 0, 1, point.hour), {
      hour: 'numeric',
    }),
    [t('incoming')]: point.incoming,
    [t('outgoing')]: point.outgoing,
  }));

  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {view === 'time' ? t('description') : t('descriptionHour')}
        </CardDescription>
        <CardAction>
          <Tabs value={view} onValueChange={(value) => setView(value as View)}>
            <TabsList>
              <TabsTrigger value="time" className="px-2.5 text-xs">
                {t('byTime')}
              </TabsTrigger>
              <TabsTrigger value="hours" className="px-2.5 text-xs">
                {t('byHour')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {totalIn + totalOut === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={t('empty')}
            hint={t('emptyHint')}
            className="flex-1"
          />
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap">
              <Stat label={t('incoming')} value={format.number(totalIn)} />
              <Stat label={t('outgoing')} value={format.number(totalOut)} />
              <Stat
                label={t('deliveryRate')}
                value={deliveryRate == null ? t('none') : percent(deliveryRate)}
              />
              <Stat
                label={t('readRate')}
                value={readRate == null ? t('none') : percent(readRate)}
              />
              {data.summary.failed > 0 ? (
                <Stat
                  label={t('failed')}
                  value={format.number(data.summary.failed)}
                />
              ) : null}
            </dl>
            <BarChart
              className="min-h-[240px] flex-1"
              data={view === 'time' ? timeData : hoursData}
              index="label"
              categories={[t('incoming'), t('outgoing')]}
              colors={['teal', 'violet']}
              type="stacked"
              yAxisWidth={36}
              legendPosition="right"
              valueFormatter={(value) => format.number(value)}
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
