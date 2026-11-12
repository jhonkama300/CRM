'use client';

import { Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { initialsOf } from '@/components/dashboard/initials';
import { Skeleton } from '@/components/dashboard/skeleton';
import { useFormatDuration } from '@/components/dashboard/use-format-duration';
import { cn } from '@/lib/utils';

export function AgentsCard({ data }: { data: AccountMetrics | null }) {
  const t = useTranslations('Metrics.agents');
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

  const agents = [...data.agents].sort(
    (a, b) =>
      b.replies - a.replies ||
      b.open - a.open ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );
  const hasActivity = agents.some(
    (agent) =>
      agent.replies > 0 ||
      agent.open > 0 ||
      agent.assigned > 0 ||
      agent.handled > 0
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
        {!hasActivity ? (
          <EmptyState icon={Users} title={t('empty')} hint={t('emptyHint')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('agent')}</TableHead>
                <TableHead className="text-right">{t('assigned')}</TableHead>
                <TableHead className="text-right">{t('handled')}</TableHead>
                <TableHead className="text-right">{t('resolved')}</TableHead>
                <TableHead className="text-right">{t('open')}</TableHead>
                <TableHead className="text-right">{t('replies')}</TableHead>
                <TableHead className="text-right">{t('median')}</TableHead>
                <TableHead className="text-right">{t('average')}</TableHead>
                <TableHead className="text-right">{t('p90')}</TableHead>
                <TableHead className="text-right">{t('sla')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => {
                const name = agent.name || t('unnamed');
                const sla = ratio(agent.withinTarget, agent.replies);
                return (
                  <TableRow key={agent.userId}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar size="sm">
                          {agent.avatarUrl ? (
                            <AvatarImage src={agent.avatarUrl} alt="" />
                          ) : null}
                          <AvatarFallback className="text-[10px]">
                            {initialsOf(name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(agent.assigned)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(agent.handled)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(agent.resolved)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(agent.open)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {format.number(agent.replies)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        agent.medianMinutes != null &&
                          agent.medianMinutes > data.replyTargetMinutes &&
                          'text-status-serious'
                      )}
                    >
                      {agent.medianMinutes == null
                        ? t('none')
                        : formatDuration(agent.medianMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {agent.avgMinutes == null
                        ? t('none')
                        : formatDuration(agent.avgMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {agent.p90Minutes == null
                        ? t('none')
                        : formatDuration(agent.p90Minutes)}
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
