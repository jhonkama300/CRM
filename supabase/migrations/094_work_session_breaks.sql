-- ============================================================
-- 094_work_session_breaks.sql
--
-- Break tracking for the work-time card: Pausar/Reanudar on an open
-- shift, plus break duration on the card. Worked time is
-- (now - started_at - break_seconds - current_break_elapsed).
-- ============================================================

ALTER TABLE public.work_sessions
  ADD COLUMN IF NOT EXISTS break_started_at timestamptz;

ALTER TABLE public.work_sessions
  ADD COLUMN IF NOT EXISTS break_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.work_sessions
  DROP CONSTRAINT IF EXISTS work_sessions_break_seconds_check;
ALTER TABLE public.work_sessions
  ADD CONSTRAINT work_sessions_break_seconds_check CHECK (break_seconds >= 0);

CREATE OR REPLACE FUNCTION public.work_pause()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.work_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.work_sessions
  WHERE user_id = auth.uid() AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_row.break_started_at IS NULL THEN
    UPDATE public.work_sessions
    SET break_started_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

ALTER FUNCTION public.work_pause() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.work_pause() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_pause() TO authenticated;

CREATE OR REPLACE FUNCTION public.work_resume()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.work_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.work_sessions
  WHERE user_id = auth.uid() AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_row.break_started_at IS NOT NULL THEN
    UPDATE public.work_sessions
    SET break_seconds = break_seconds
        + GREATEST(0, EXTRACT(EPOCH FROM (now() - break_started_at))::integer),
        break_started_at = NULL
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

ALTER FUNCTION public.work_resume() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.work_resume() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_resume() TO authenticated;

CREATE OR REPLACE FUNCTION public.work_check_out()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.work_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.work_sessions
  WHERE user_id = auth.uid() AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.work_sessions
  SET break_seconds = break_seconds
      + CASE
          WHEN break_started_at IS NULL THEN 0
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (now() - break_started_at))::integer)
        END,
      break_started_at = NULL,
      ended_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

ALTER FUNCTION public.work_check_out() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.work_check_out() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_check_out() TO authenticated;
