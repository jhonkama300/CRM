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

/** Reusable shift card (status, timer, break, pause/finish). */
export function WorkCard() {
  const t = useTranslations('WorkTime');
  const [reason, setReason] = useState('');
  const {
    active,
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
          stale ? (staleEnd ?? undefined) : undefined
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
          <p className="text-foreground flex flex-wrap items-baseline gap-1.5 text-sm font-medium">
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
                <span className="tabular-nums">
                  {formatClock(elapsedSeconds)}
                </span>
              </>
            )}
          </p>
          {active && startedAt && (
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              {t('onShiftSince', { time: startedAt })}
            </p>
          )}
          {!active && workedToday && (
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              {t('today')}: {formatClock(elapsedSeconds)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/settings?tab=worktime"
            aria-label={t('history')}
            title={t('history')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-6 items-center justify-center rounded"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </div>
      </div>

      {active ? (
        <>
          <div className="bg-muted text-muted-foreground mt-3 rounded-lg px-3 py-2 text-xs">
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
                className="bg-muted text-foreground mt-2 min-h-20 border-red-500/30"
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
                  : 'bg-primary text-primary-foreground flex flex-1 overflow-hidden rounded-lg'
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
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 w-full"
        >
          {busy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-1 h-4 w-4" />
          )}
          {workedToday ? t('resumeShift') : t('startShift')}
        </Button>
      )}
    </div>
  );
}
