'use client';

import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  breakSecondsForSession,
  overlapSeconds,
  startOfLocalDay,
} from '@/lib/worktime';

export interface WorkSession {
  id: string;
  account_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  break_started_at: string | null;
  break_seconds: number;
  close_reason?: string | null;
}

export interface WorkSchedule {
  workday_start: string | null;
  workday_end: string | null;
  break_start: string | null;
  break_end: string | null;
}

interface WorkStatus {
  active: WorkSession | null;
  pulse: number;
  schedule: WorkSchedule | null;
}

const POLL_MS = 30_000;

/**
 * Own open shift + account-wide active count, with a 1s tick for the
 * running timer. The pulse is polled (not realtime) because non-admins
 * cannot read other members' session rows under RLS.
 */
export function useWorkSession() {
  const { accountId, user } = useAuth();
  const [active, setActive] = useState<WorkSession | null>(null);
  const [pulse, setPulse] = useState(0);
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [todaySessions, setTodaySessions] = useState<WorkSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('work_status');
    if (!error && data) {
      const status = data as WorkStatus;
      setActive(status.active ?? null);
      setPulse(Number(status.pulse) || 0);
      setSchedule(status.schedule ?? null);
    }

    if (user) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data: rows } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('user_id', user.id)
        .gte('started_at', start.toISOString())
        .order('started_at', { ascending: true });
      setTodaySessions((rows ?? []) as WorkSession[]);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!accountId) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [accountId, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Keep the header and the Settings panel in sync after either one
  // starts, pauses, resumes, or finishes a shift.
  useEffect(() => {
    const onUpdate = () => void refresh();
    window.addEventListener('wacrm:work-updated', onUpdate);
    return () => window.removeEventListener('wacrm:work-updated', onUpdate);
  }, [refresh]);

  const announce = () =>
    window.dispatchEvent(new Event('wacrm:work-updated'));

  const checkIn = useCallback(async () => {
    const supabase = createClient();
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('work_check_in');
      if (error) throw error;
      setActive((data as WorkSession | null) ?? null);
      await refresh();
      announce();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const checkOut = useCallback(async (reason?: string, endedAt?: string) => {
    const supabase = createClient();
    setBusy(true);
    try {
      const { error } = await supabase.rpc('work_check_out', {
        p_reason: reason ?? null,
        p_ended_at: endedAt ?? null,
      });
      if (error) throw error;
      setActive(null);
      await refresh();
      announce();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const pause = useCallback(async () => {
    const supabase = createClient();
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('work_pause');
      if (error) throw error;
      setActive((data as WorkSession | null) ?? null);
      await refresh();
      announce();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const resume = useCallback(async () => {
    const supabase = createClient();
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('work_resume');
      if (error) throw error;
      setActive((data as WorkSession | null) ?? null);
      await refresh();
      announce();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const dayStart = startOfLocalDay(new Date(now));
  const todays = todaySessions.filter(
    (session) => new Date(session.started_at).getTime() >= dayStart,
  );
  const elapsedSeconds = todays.reduce(
    (sum, session) => sum + overlapSeconds(session, dayStart, now),
    0,
  );
  const breakSeconds = todays.reduce(
    (sum, session) => sum + breakSecondsForSession(session, dayStart, now),
    0,
  );
  const workedToday = todays.length > 0;
  const onBreak = !!active?.break_started_at;
  const stale =
    !!active && new Date(active.started_at).getTime() < dayStart;
  const staleEnd = active
    ? new Date(
        new Date(new Date(active.started_at).setHours(0, 0, 0, 0)).getTime() +
          24 * 60 * 60 * 1000,
      ).toISOString()
    : null;

  return {
    active,
    pulse,
    schedule,
    workedToday,
    loading,
    busy,
    now,
    onBreak,
    stale,
    staleEnd,
    elapsedSeconds,
    breakSeconds,
    refresh,
    checkIn,
    checkOut,
    pause,
    resume,
  };
}