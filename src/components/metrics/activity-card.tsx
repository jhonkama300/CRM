'use client';

import { CalendarDays } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { AccountMetrics } from '@/lib/metrics/overview';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Skeleton } from '@/components/dashboard/skeleton';
import { cn } from '@/lib/utils';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function ActivityCard({ data }: { data: AccountMetrics | null }) {
  const t = useTranslations('Metricas.activity');
  const format = useFormatter();

  if (!data) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    );
  }

  const cells = data.activity.matrix;
  const max = cells.reduce((highest, cell) => Math.max(highest, cell.count), 0);
  const byKey = new Map(
    cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell.count])
  );
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);

  const weekdayLabel = (weekday: number) =>
    format.dateTime(new Date(2024, 0, 7 + weekday), { weekday: 'short' });

  const peakHour =
    data.activity.peakHour == null
      ? null
      : format.dateTime(new Date(2024, 0, 7, data.activity.peakHour), {
          hour: 'numeric',
        });
  const peakWeekday =
    data.activity.peakWeekday == null
      ? null
      : weekdayLabel(data.activity.peakWeekday);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={t('empty')}
            hint={t('emptyHint')}
          />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <div className="min-w-[620px]">
                <div className="text-muted-foreground mb-1 ml-10 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-1 text-[10px]">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span key={hour} className="text-center tabular-nums">
                      {hour % 3 === 0 ? hour : ''}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-[2rem_1fr] gap-1">
                  <div className="flex flex-col gap-1">
                    {WEEKDAYS.map((weekday) => (
                      <span
                        key={weekday}
                        className="text-muted-foreground flex h-6 items-center text-[10px] capitalize"
                      >
                        {weekdayLabel(weekday)}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-rows-7 gap-1">
                    {WEEKDAYS.map((weekday) => (
                      <div
                        key={weekday}
                        className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-1"
                      >
                        {Array.from({ length: 24 }, (_, hour) => {
                          const count = byKey.get(`${weekday}:${hour}`) ?? 0;
                          const intensity =
                            max === 0 || count === 0
                              ? 0
                              : Math.max(0.12, count / max);
                          return (
                            <div
                              key={hour}
                              className={cn(
                                'bg-muted h-6 rounded-sm transition-colors',
                                count === 0 && 'opacity-60'
                              )}
                              style={
                                count > 0
                                  ? {
                                      backgroundColor: 'var(--primary)',
                                      opacity: intensity,
                                    }
                                  : undefined
                              }
                              title={t('cell', {
                                count,
                                weekday: weekdayLabel(weekday),
                                hour,
                              })}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span>{t('peakHour', { hour: peakHour ?? t('none') })}</span>
              <span>
                {t('peakWeekday', { weekday: peakWeekday ?? t('none') })}
              </span>
              <span className="tabular-nums">
                {t('total', { count: format.number(total) })}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
