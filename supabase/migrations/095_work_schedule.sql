-- ============================================================
-- 095_work_schedule.sql
--
-- Company-wide work schedule shown in the check-in card and edited
-- from Settings -> Jornada. Times are wall-clock values; the employee's
-- browser renders them in the account context. NULL means "not set".
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS workday_start time;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS workday_end time;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS break_start time;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS break_end time;

CREATE OR REPLACE FUNCTION public.work_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account uuid;
  v_active jsonb;
  v_pulse integer := 0;
  v_schedule jsonb;
BEGIN
  SELECT account_id INTO v_account
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF v_account IS NULL THEN
    RETURN jsonb_build_object('active', NULL, 'pulse', 0, 'schedule', NULL);
  END IF;

  SELECT to_jsonb(ws) INTO v_active
  FROM public.work_sessions ws
  WHERE ws.user_id = auth.uid() AND ws.ended_at IS NULL
  ORDER BY ws.started_at DESC
  LIMIT 1;

  SELECT count(*) INTO v_pulse
  FROM public.work_sessions ws
  WHERE ws.account_id = v_account AND ws.ended_at IS NULL;

  SELECT jsonb_build_object(
    'workday_start', a.workday_start,
    'workday_end', a.workday_end,
    'break_start', a.break_start,
    'break_end', a.break_end
  ) INTO v_schedule
  FROM public.accounts a
  WHERE a.id = v_account;

  RETURN jsonb_build_object(
    'active', v_active,
    'pulse', v_pulse,
    'schedule', v_schedule
  );
END;
$$;

ALTER FUNCTION public.work_status() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.work_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_status() TO authenticated;
