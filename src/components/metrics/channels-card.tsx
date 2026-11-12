'use client';

import { Radio } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ratio } from '@/lib/dashboard/overview';
import type { AccountMetrics } from '@/lib/metrics/overview';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Skeleton } from '@/components/dashboard/skeleton';
import { useFormatDuration } from '@/components/dashboard/use-format-duration';
import { cn } from '@/lib/utils';

export function ChannelsCard({ data }: { data: AccountMetrics | null }) {
  const t = useTranslations('Metrics.channels');
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

  const channels = [...data.channels].sort(
    (a, b) => b.incoming + b.outgoing - (a.incoming + a.outgoing)
  );
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="px-2">
        {channels.length === 0 ? (
          <EmptyState icon={Radio} title={t('empty')} hint={t('emptyHint')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('channel')}</TableHead>
                <TableHead className="text-right">{t('new')}</TableHead>
                <TableHead className="text-right">{t('incoming')}</TableHead>
                <TableHead className="text-right">{t('outgoing')}</TableHead>
                <TableHead className="text-right">{t('open')}</TableHead>
                <TableHead className="text-right">{t('resolved')}</TableHead>
                <TableHead className="text-right">{t('median')}</TableHead>
                <TableHead className="text-right">{t('p90')}</TableHead>
                <TableHead className="text-right">{t('sla')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => {
                const sla = ratio(channel.withinTarget, channel.replies);
                return (
                  <TableRow key={channel.channelId}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: channel.color }}
                          aria-hidden
                        />
                        <span className="truncate">{channel.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(channel.newConversations)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(channel.incoming)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(channel.outgoing)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(channel.openConversations)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(channel.resolved)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        channel.medianMinutes != null &&
                          channel.medianMinutes > data.replyTargetMinutes &&
                          'text-status-serious'
                      )}
                    >
                      {channel.medianMinutes == null
                        ? t('none')
                        : formatDuration(channel.medianMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {channel.p90Minutes == null
                        ? t('none')
                        : formatDuration(channel.p90Minutes)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        sla != null && sla < 0.8 && 'text-status-serious'
                      )}
                    >
                      {sla == null ? t('none') : percent(sla)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
