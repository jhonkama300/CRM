'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Loader2, Play, RefreshCw, Square, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useWorkSession, type WorkSession } from '@/hooks/use-work-session';
import {
  formatClock,
  formatHours,
  overlapSeconds,
  startOfLocalDay,
  startOfLocalWeek,
} from '@/lib/worktime';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { SettingsPanelHead } from './settings-panel-head';

interface TeamMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

function timeLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WorkTimePanel() {
  const t = useTranslations('WorkTime');
  const { user, accountId, canManageMembers } = useAuth();
  const work = useWorkSession();
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = canManageMembers;

  const load = useCallback(async () => {
    if (!accountId || !user) return;
    const supabase = createClient();
    const weekStartIso = new Date(startOfLocalWeek(new Date())).toISOString();

    const [recent, open, memberRows] = await Promise.all([
      supabase
        .from('work_sessions')
        .select('*')
        .eq('account_id', accountId)
        .gte('started_at', weekStartIso)
        .order('started_at', { ascending: false }),
      supabase
        .from('work_sessions')
        .select('*')
        .eq('account_id', accountId)
        .is('ended_at', null),
      isAdmin
        ? supabase
            .from('profiles')
            .select('user_id, full_name, email, avatar_url')
            .eq('account_id', accountId)
        : Promise.resolve({ data: [] as TeamMember[] }),
    ]);

    const merged = new Map<string, WorkSession>();
    for (const row of [
      ...((recent.data ?? []) as WorkSession[]),
      ...((open.data ?? []) as WorkSession[]),
    ]) {
      merged.set(row.id, row);
    }
    setSessions([...merged.values()]);
    if (isAdmin) setMembers((memberRows.data ?? []) as TeamMember[]);
    setLoading(false);
  }, [accountId, isAdmin, user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    const onUpdate = () => void load();
    window.addEventListener('wacrm:work-updated', onUpdate);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('wacrm:work-updated', onUpdate);
    };
  }, [load]);

  const now = work.now;
  const dayStart = startOfLocalDay(new Date(now));
  const weekStart = startOfLocalWeek(new Date(now));

  const ownSessions = useMemo(
    () => sessions.filter((s) => s.user_id === user?.id),
    [sessions, user?.id]
  );
  const ownToday = ownSessions.reduce(
    (sum, s) => sum + overlapSeconds(s, dayStart, now),
    0
  );
  const ownWeek = ownSessions.reduce(
    (sum, s) => sum + overlapSeconds(s, weekStart, now),
    0
  );

  const teamRows = (() => {
    if (!isAdmin) return [];
    return members
      .map((member) => {
        const rows = sessions.filter((s) => s.user_id === member.user_id);
        const active = rows.find((s) => !s.ended_at) ?? null;
        const last = rows.reduce<string | null>(
          (latest, s) =>
            !latest || s.started_at > latest ? s.started_at : latest,
          null
        );
        return {
          member,
          active,
          last,
          today: rows.reduce(
            (sum, s) => sum + overlapSeconds(s, dayStart, now),
            0
          ),
          week: rows.reduce(
            (sum, s) => sum + overlapSeconds(s, weekStart, now),
            0
          ),
        };
      })
      .sort((a, b) => {
        if (!!a.active !== !!b.active) return a.active ? -1 : 1;
        return (a.member.full_name ?? a.member.email ?? '').localeCompare(
          b.member.full_name ?? b.member.email ?? ''
        );
      });
  })();

  const toggle = async () => {
    try {
      if (work.active) {
        await work.checkOut();
        toast.success(t('checkOutSuccess'));
      } else {
        await work.checkIn();
        toast.success(t('checkInSuccess'));
      }
      await load();
    } catch {
      toast.error(t('actionFailed'));
    }
  };

  const recentOwn = ownSessions.slice(0, 10);
  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              className={cn('mr-1 h-3.5 w-3.5', loading && 'animate-spin')}
            />
            {t('refresh')}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Clock className="text-primary size-4" />
              {t('myStatus')}
            </CardTitle>
            <CardDescription>
              {work.active
                ? work.onBreak
                  ? t('onBreak')
                  : t('onShiftSince', {
                      time: timeLabel(work.active.started_at),
                    })
                : t('offShift')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-foreground text-3xl font-semibold tracking-tight tabular-nums">
                {work.active ? formatClock(work.elapsedSeconds) : '—'}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t('elapsed')}
              </p>
            </div>
            <Button
              onClick={() => void toggle()}
              disabled={work.busy}
              className={cn(
                work.active
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {work.busy ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : work.active ? (
                <Square className="mr-1 h-4 w-4" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              {work.active ? t('checkOut') : t('checkIn')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Users className="text-primary size-4" />
              {t('activeNow')}
            </CardTitle>
            <CardDescription>
              {t('workingNow', { count: work.pulse })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-3xl font-semibold tracking-tight tabular-nums">
              {work.pulse}
            </p>
            <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
              <span>{t('today')}</span>
              <span className="text-foreground font-medium tabular-nums">
                {formatHours(ownToday)}
              </span>
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
              <span>{t('thisWeek')}</span>
              <span className="text-foreground font-medium tabular-nums">
                {formatHours(ownWeek)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Users className="text-primary size-4" />
              {t('team')}
            </CardTitle>
            <CardDescription>{t('teamDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="text-primary size-5 animate-spin" />
              </div>
            ) : (
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left text-xs">
                    <th className="pb-2 font-medium">{t('employee')}</th>
                    <th className="pb-2 font-medium">{t('status')}</th>
                    <th className="pb-2 text-right font-medium">
                      {t('today')}
                    </th>
                    <th className="pb-2 text-right font-medium">
                      {t('thisWeek')}
                    </th>
                    <th className="pb-2 text-right font-medium">
                      {t('lastCheckIn')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map(({ member, active, last, today, week }) => {
                    const label = member.full_name || member.email || '—';
                    const initial = label.charAt(0).toUpperCase();
                    return (
                      <tr
                        key={member.user_id}
                        className="border-border/60 border-b last:border-0"
                      >
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="size-7">
                              {member.avatar_url ? (
                                <AvatarImage
                                  src={member.avatar_url}
                                  alt={label}
                                />
                              ) : null}
                              <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                                {initial}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-foreground max-w-[220px] truncate">
                              {label}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 text-xs',
                              active
                                ? active.break_started_at
                                  ? 'text-amber-500'
                                  : 'text-emerald-500'
                                : 'text-muted-foreground'
                            )}
                          >
                            <span
                              className={cn(
                                'size-1.5 rounded-full',
                                active
                                  ? active.break_started_at
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                  : 'bg-muted-foreground/50'
                              )}
                            />
                            {active
                              ? active.break_started_at
                                ? t('onBreak')
                                : t('active')
                              : t('finished')}
                          </span>
                        </td>
                        <td className="text-foreground py-2.5 text-right tabular-nums">
                          {formatHours(today)}
                        </td>
                        <td className="text-foreground py-2.5 text-right tabular-nums">
                          {formatHours(week)}
                        </td>
                        <td className="text-muted-foreground py-2.5 text-right tabular-nums">
                          {timeLabel(last)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Clock className="text-muted-foreground size-4" />
            {t('myHistory')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="text-primary size-5 animate-spin" />
            </div>
          ) : recentOwn.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t('noSessions')}
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {recentOwn.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="text-foreground">
                    {new Date(session.started_at).toLocaleDateString(
                      undefined,
                      {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                      }
                    )}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {timeLabel(session.started_at)} –{' '}
                    {session.ended_at
                      ? timeLabel(session.ended_at)
                      : t('active')}
                  </span>
                  <span className="text-foreground font-medium tabular-nums">
                    {formatHours(overlapSeconds(session, 0, now))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
