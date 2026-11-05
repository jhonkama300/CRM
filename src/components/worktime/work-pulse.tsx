'use client';

import { AlertTriangle, Clock, Pause } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useWorkSession } from '@/hooks/use-work-session';
import { formatClock } from '@/lib/worktime';
import { cn } from '@/lib/utils';

/**
 * Static header time display (not a button). The avatar opens the full
 * work card; this half only shows the running timer and break time.
 */
export function WorkPulse() {
  const t = useTranslations('WorkTime');
  const { active, loading, stale, workedToday, elapsedSeconds, breakSeconds } =
    useWorkSession();

  const paused = !active && workedToday;

  if (loading) return null;

  return (
    <div
      className={cn(
        'flex h-full flex-col justify-center px-2.5 text-xs leading-tight',
        stale ? 'text-red-400' : 'text-muted-foreground'
      )}
      aria-label={
        stale
          ? t('staleTitle')
          : active
            ? t('atWork')
            : paused
              ? t('dayFinished')
              : t('offShift')
      }
    >
      <span className="flex items-center gap-1.5">
        {stale ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        ) : paused ? (
          <Pause className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Clock className="h-3.5 w-3.5 shrink-0" />
        )}
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            stale ? 'text-red-400' : 'text-foreground'
          )}
        >
          {formatClock(elapsedSeconds)}
        </span>
      </span>
      <span className="mt-0.5 text-[9px] whitespace-nowrap">
        {t('breakShort', { duration: formatClock(breakSeconds) })}
      </span>
    </div>
  );
}
