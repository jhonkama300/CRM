'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pause,
  Pencil,
  Play,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { useWorkSession } from '@/hooks/use-work-session';
import { formatClock } from '@/lib/worktime';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function shortTime(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

/** Reusable shift card (status, timer, break, pause/finish, schedule). */
export function WorkCard() {
  const t = useTranslations('WorkTime');
  const [reason, setReason] = useState('');
  const {
    active,
    pulse,
    schedule,
    workedToday,
    busy,
    onBreak,
    stale,
    staleEnd,
    elapsedSeconds,
    breakSeconds,
    checkIn,
    checkOut,
    pause,
    resume,
  } = useWorkSession();

  const startedAt = active
    ? new Date(active.started_at).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const run = async (action: 'in' | 'out' | 'pause' | 'resume') => {
    try {
      if (action === 'in') {
        await checkIn();
        toast.success(t('checkInSuccess'));
      } else if (action === 'out') {
        await checkOut(
          stale ? reason.trim() : undefined,
          stale ? (staleEnd ?? undefined) : undefined,
        );
        toast.success(t('checkOutSuccess'));
      } else if (action === 'pause') {
        await pause();
      } else {
        await resume();
      }
    } catch {
      toast.error(t('actionFailed'));
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-1.5 text-sm font-medium text-foreground">
            <span>
              {active
                ? stale
                  ? t('staleStatus')
                  : onBreak
                    ? t('onBreak')
                    : t('atWork')
                : workedToday
                  ? t('dayFinished')
                  : t('offShift')}
            </span>
            {active && (
              <>
                <span className="text-muted-foreground">|</span>
                <span className="tabular-nums">{formatClock(elapsedSeconds)}</span>
              </>
            )}
          </p>
          {active && startedAt && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('onShiftSince', { time: startedAt })}
            </p>
          )}
          {!active && workedToday && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('today')}: {formatClock(elapsedSeconds)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/settings?tab=worktime"
            aria-label={t('history')}
            title={t('history')}
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {active ? (
        <>
          <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t('breakDuration', { duration: formatClock(breakSeconds) })}
          </div>

          {stale && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('staleTitle')}
              </p>
              <p className="mt-1 text-red-300/80">{t('staleDesc')}</p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('staleReasonPlaceholder')}
                className="mt-2 min-h-20 border-red-500/30 bg-muted text-foreground"
              />
            </div>
          )}

          <div className="mt-3 flex gap-2">
            {!stale && (
              <Button
                variant="outline"
                onClick={() => void run(onBreak ? 'resume' : 'pause')}
                disabled={busy}
                className="flex-1"
              >
                {busy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : onBreak ? (
                  <Play className="mr-1 h-4 w-4" />
                ) : (
                  <Pause className="mr-1 h-4 w-4" />
                )}
                {onBreak ? t('resume') : t('pause')}
              </Button>
            )}

            <div
              className={
                stale
                  ? 'flex flex-1 overflow-hidden rounded-lg bg-red-600 text-white'
                  : 'flex flex-1 overflow-hidden rounded-lg bg-primary text-primary-foreground'
              }
            >
              <button
                type="button"
                onClick={() => void run('out')}
                disabled={busy || (stale && !reason.trim())}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 text-sm font-medium hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Power className="h-4 w-4" />
                {t('finish')}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t('history')}
                  className="flex w-8 cursor-pointer items-center justify-center border-l border-white/20 hover:brightness-110"
                >
                  <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6}>
                  <DropdownMenuItem
                    render={<Link href="/settings?tab=worktime" />}
                  >
                    {t('history')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </>
      ) : (
        <Button
          onClick={() => void run('in')}
          disabled={busy}
          className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {busy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-1 h-4 w-4" />
          )}
          {workedToday ? t('resumeShift') : t('startShift')}
        </Button>
      )}

      {schedule &&
        (schedule.workday_start || schedule.workday_end || schedule.break_start) && (
          <div className="mt-3 space-y-0.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
            {schedule.workday_start && schedule.workday_end && (
              <p>
                {t('scheduleLine', {
                  start: shortTime(schedule.workday_start) ?? '',
                  end: shortTime(schedule.workday_end) ?? '',
                })}
              </p>
            )}
            {schedule.break_start && schedule.break_end && (
              <p>
                {t('breakLine', {
                  start: shortTime(schedule.break_start) ?? '',
                  end: shortTime(schedule.break_end) ?? '',
                })}
              </p>
            )}
          </div>
        )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        {t('workingNow', { count: pulse })}
      </p>
    </div>
  );
}