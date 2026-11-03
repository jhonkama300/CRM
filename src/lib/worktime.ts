import type { WorkSession } from '@/hooks/use-work-session';

/**
 * Seconds of a session clipped to [start, end], excluding breaks.
 * Completed breaks are stored as a total; the open break is counted up
 * to `end` (the caller passes `now` for active sessions).
 */
export function overlapSeconds(
  session: Pick<
    WorkSession,
    'started_at' | 'ended_at' | 'break_started_at' | 'break_seconds'
  >,
  start: number,
  end: number,
): number {
  const s = new Date(session.started_at).getTime();
  const e = session.ended_at ? new Date(session.ended_at).getTime() : end;
  const from = Math.max(s, start);
  const to = Math.min(e, end);
  const raw = Math.max(0, Math.floor((to - from) / 1000));
  const openBreak = session.break_started_at
    ? Math.max(
        0,
        Math.floor(
          (Math.min(end, Math.max(end, 0)) -
            new Date(session.break_started_at).getTime()) /
            1000,
        ),
      )
    : 0;
  const breaks = (session.break_seconds ?? 0) + openBreak;
  return Math.max(0, raw - Math.min(raw, breaks));
}

export function startOfLocalDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 in the viewer's timezone. */
export function startOfLocalWeek(date: Date): number {
  const d = new Date(startOfLocalDay(date));
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.getTime();
}

/** "7h 32m" / "45m". */
export function formatHours(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Running timer "1:05:09". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Break seconds inside [start, end] for a session. */
export function breakSecondsForSession(
  session: Pick<
    WorkSession,
    'started_at' | 'ended_at' | 'break_started_at' | 'break_seconds'
  >,
  start: number,
  end: number,
): number {
  const s = new Date(session.started_at).getTime();
  const e = session.ended_at ? new Date(session.ended_at).getTime() : end;
  const from = Math.max(s, start);
  const to = Math.min(e, end);
  const raw = Math.max(0, Math.floor((to - from) / 1000));
  const openBreak = session.break_started_at
    ? Math.max(
        0,
        Math.floor(
          (Math.min(e, end) - new Date(session.break_started_at).getTime()) /
            1000,
        ),
      )
    : 0;
  return Math.max(0, Math.min(raw, (session.break_seconds ?? 0) + openBreak));
}
