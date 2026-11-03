-- ============================================================
-- 096_work_session_close_reason.sql
--
-- Lets a stale open shift (started on a previous day) be closed with
-- a mandatory reason. Also allows the UI to cap the close time at the
-- end of the original day instead of counting overnight hours.
-- ============================================================

ALTER TABLE public.work_sessions
  ADD COLUMN IF NOT EXISTS close_reason text;

DROP FUNCTION IF EXISTS public.work_check_out();

CREATE OR REPLACE FUNCTION public.work_check_out(
  p_reason text DEFAULT NULL,
  p_ended_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.work_sessions;
  v_end timestamptz;
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

  v_end := GREATEST(
    v_row.started_at,
    LEAST(COALESCE(p_ended_at, now()), now())
  );

  UPDATE public.work_sessions
  SET break_seconds = break_seconds
      + CASE
          WHEN break_started_at IS NULL THEN 0
          ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_end - break_started_at))::integer)
        END,
      break_started_at = NULL,
      ended_at = v_end,
      close_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

ALTER FUNCTION public.work_check_out(text, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.work_check_out(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_check_out(text, timestamptz) TO authenticated;
