'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { usePresence } from '@/hooks/use-presence';
import { createClient } from '@/lib/supabase/client';

interface TeamMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface Worker {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  started_at: string;
  break_started_at: string | null;
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Compact "employees online" card for the account popover. The ring
 * count is presence-based, the working number comes from the account
 * work pulse, and "finished" counts teammates who closed a shift today
 * (admins only - RLS hides other members' session rows from agents).
 */
export function TeamPresenceCard({ working }: { working: number }) {
  const t = useTranslations('WorkTime');
  const { accountId, canManageMembers, user } = useAuth();
  const { getPresence } = usePresence();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersOpen, setWorkersOpen] = useState(false);
  const [finishedToday, setFinishedToday] = useState<number | null>(null);

  useEffect(() => {
    if (!accountId) return;

    let cancelled = false;
    const supabase = createClient();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const loadMembers = async () => {
      try {
        const res = await fetch('/api/account/members', { cache: 'no-store' });
        if (!res.ok) return;
        const payload = (await res.json()) as { members?: TeamMember[] };
        if (!cancelled) setMembers(payload.members ?? []);
      } catch {
        // Presence still works with the cached roster; keep the card quiet.
      }
    };

    const loadWorkers = async () => {
      try {
        const res = await fetch('/api/account/work/active', {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { workers?: Worker[] };
        if (!cancelled) setWorkers(payload.workers ?? []);
      } catch {
        // The count still comes from the work pulse; keep the list quiet.
      }
    };

    const loadFinished = async () => {
      if (!canManageMembers) {
        if (!cancelled) setFinishedToday(null);
        return;
      }
      const { data, error } = await supabase
        .from('work_sessions')
        .select('user_id, ended_at')
        .eq('account_id', accountId)
        .gte('started_at', dayStart.toISOString())
        .lt('started_at', dayEnd.toISOString());
      if (cancelled) return;
      if (error) {
        setFinishedToday(null);
        return;
      }
      const rows = (data ?? []) as {
        user_id: string;
        ended_at: string | null;
      }[];
      const stillWorking = new Set(
        rows.filter((row) => !row.ended_at).map((row) => row.user_id)
      );
      const finished = new Set(
        rows
          .filter((row) => !!row.ended_at)
          .map((row) => row.user_id)
          .filter((userId) => !stillWorking.has(userId))
      );
      setFinishedToday(finished.size);
    };

    void Promise.all([loadMembers(), loadWorkers(), loadFinished()]);
    const interval = window.setInterval(() => {
      void loadMembers();
      void loadWorkers();
      void loadFinished();
    }, 60_000);
    const onWorkUpdated = () => {
      void loadWorkers();
      void loadFinished();
    };
    window.addEventListener('wacrm:work-updated', onWorkUpdated);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('wacrm:work-updated', onWorkUpdated);
    };
  }, [accountId, canManageMembers]);

  const onlineMembers = useMemo(() => {
    return members
      .filter((member) => getPresence(member.user_id) !== 'offline')
      .sort((a, b) => {
        if (a.user_id === user?.id) return -1;
        if (b.user_id === user?.id) return 1;
        const left = a.full_name ?? a.email ?? '';
        const right = b.full_name ?? b.email ?? '';
        return left.localeCompare(right);
      });
  }, [getPresence, members, user?.id]);

  const visible = onlineMembers.slice(0, 8);
  const extra = onlineMembers.length - visible.length;
  const onlineCount = onlineMembers.length;

  return (
    <div className="border-border bg-card mx-4 mt-4 rounded-xl border p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setWorkersOpen((open) => !open)}
          aria-expanded={workersOpen}
          aria-controls="team-workers"
          aria-label={t('employeesOnline')}
          title={t('employeesOnline')}
          className="text-foreground focus-visible:ring-primary focus-visible:ring-offset-card flex size-12 shrink-0 cursor-pointer flex-col items-center justify-center rounded-full border-[3px] border-emerald-400/70 bg-emerald-400/10 text-center transition-colors hover:bg-emerald-400/15 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <span className="text-base leading-none font-semibold tabular-nums">
            {onlineCount > 99 ? '99+' : onlineCount}
          </span>
          <ChevronDown
            className={
              workersOpen
                ? 'text-muted-foreground mt-0.5 size-2.5 rotate-180 transition-transform'
                : 'text-muted-foreground mt-0.5 size-2.5 transition-transform'
            }
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex min-h-7 items-center">
            {visible.length > 0 ? (
              <div className="flex -space-x-2">
                {visible.map((member) => {
                  const label =
                    member.full_name || member.email || t('employee');
                  return (
                    <span key={member.user_id} title={label}>
                      <Avatar className="ring-card size-7 ring-2">
                        {member.avatar_url ? (
                          <AvatarImage src={member.avatar_url} alt={label} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-semibold">
                          {initials(label)}
                        </AvatarFallback>
                      </Avatar>
                    </span>
                  );
                })}
                {extra > 0 ? (
                  <span className="bg-muted text-muted-foreground ring-card flex size-7 items-center justify-center rounded-full text-[9px] font-semibold ring-2">
                    +{extra}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="text-muted-foreground text-[11px]">
                {t('noOneOnline')}
              </span>
            )}
          </div>

          <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px]">
            <span>
              {t('workingLabel')}{' '}
              <strong className="text-foreground font-semibold tabular-nums">
                {working}
              </strong>
            </span>
            <span>
              {t('finishedLabel')}{' '}
              <strong className="text-foreground font-semibold tabular-nums">
                {finishedToday ?? '—'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {workersOpen ? (
        <div id="team-workers" className="border-border mt-3 border-t pt-2">
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="text-foreground text-[11px] font-semibold">
              {t('workingNowTitle')}
            </p>
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {working}
            </span>
          </div>
          {workers.length === 0 ? (
            <p className="text-muted-foreground px-1 py-2 text-[11px]">
              {t('noOneWorking')}
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {workers.map((worker) => {
                const label = worker.full_name || t('employee');
                return (
                  <li
                    key={worker.user_id}
                    className="hover:bg-muted/60 flex items-center gap-2 rounded-md px-1 py-1.5"
                  >
                    <Avatar className="size-6">
                      {worker.avatar_url ? (
                        <AvatarImage src={worker.avatar_url} alt={label} />
                      ) : null}
                      <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-semibold">
                        {initials(label)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-xs font-medium">
                        {label}
                      </p>
                      <p className="text-muted-foreground text-[10px]">
                        {worker.break_started_at
                          ? t('onBreak')
                          : t('onShiftSince', {
                              time: timeLabel(worker.started_at),
                            })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
