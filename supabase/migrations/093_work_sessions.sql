-- ============================================================
-- 093_work_sessions.sql
--
-- Manual check-in / check-out for staff work time.
--
-- A row is one shift: started_at (check-in) and ended_at (check-out,
-- NULL while the person is currently working). One open shift per user
-- is enforced by a partial unique index, so a double click can never
-- leave two active sessions.
--
-- Visibility:
--   - every member reads their own shifts;
--   - admins/owners read the whole account (team report);
--   - work_status() exposes the aggregate pulse to everyone without
--     leaking other people's individual session rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_sessions_time_check
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS work_sessions_one_open_per_user
  ON public.work_sessions(user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS work_sessions_account_started_idx
  ON public.work_sessions(account_id, started_at DESC);

CREATE INDEX IF NOT EXISTS work_sessions_user_started_idx
  ON public.work_sessions(user_id, started_at DESC);

ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_sessions_select ON public.work_sessions;
CREATE POLICY work_sessions_select ON public.work_sessions FOR SELECT
  USING (
    is_account_member(account_id)
    AND (
      user_id = auth.uid()
      OR is_account_member(account_id, 'admin')
    )
  );

DROP POLICY IF EXISTS work_sessions_insert ON public.work_sessions;
CREATE POLICY work_sessions_insert ON public.work_sessions FOR INSERT
  WITH CHECK (
    is_account_member(account_id)
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS work_sessions_update ON public.work_sessions;
CREATE POLICY work_sessions_update ON public.work_sessions FOR UPDATE
  USING (
    is_account_member(account_id)
    AND (
      user_id = auth.uid()
      OR is_account_member(account_id, 'admin')
    )
  )
  WITH CHECK (
    is_account_member(account_id)
    AND (
      user_id = auth.uid()
      OR is_account_member(account_id, 'admin')
    )
  );

DROP POLICY IF EXISTS work_sessions_delete ON public.work_sessions;
CREATE POLICY work_sessions_delete ON public.work_sessions FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- Start a shift. Idempotent: returns the already-open shift if there is
-- one, so a double click cannot create duplicates.
CREATE OR REPLACE FUNCTION public.work_check_in()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account uuid;
  v_row public.work_sessions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id INTO v_account
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF v_account IS NULL OR NOT public.is_account_member(v_account) THEN
    RAISE EXCEPTION 'Caller has no account' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.work_sessions
  WHERE user_id = auth.uid() AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN to_jsonb(v_row);
  END IF;

  BEGIN
    INSERT INTO public.work_sessions (account_id, user_id, started_at)
    VALUES (v_account, auth.uid(), now())
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_row
    FROM public.work_sessions
    WHERE user_id = auth.uid() AND ended_at IS NULL
    LIMIT 1;
  END;

  RETURN to_jsonb(v_row);
END;
$$;

ALTER FUNCTION public.work_check_in() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.work_check_in() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_check_in() TO authenticated;

-- Close the caller's open shift. Returns NULL when there was nothing open.
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
  SET ended_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

ALTER FUNCTION public.work_check_out() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.work_check_out() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_check_out() TO authenticated;

-- Own active shift + account-wide active count for the header pulse.
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
BEGIN
  SELECT account_id INTO v_account
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF v_account IS NULL THEN
    RETURN jsonb_build_object('active', NULL, 'pulse', 0);
  END IF;

  SELECT to_jsonb(ws) INTO v_active
  FROM public.work_sessions ws
  WHERE ws.user_id = auth.uid() AND ws.ended_at IS NULL
  ORDER BY ws.started_at DESC
  LIMIT 1;

  SELECT count(*) INTO v_pulse
  FROM public.work_sessions ws
  WHERE ws.account_id = v_account AND ws.ended_at IS NULL;

  RETURN jsonb_build_object('active', v_active, 'pulse', v_pulse);
END;
$$;

ALTER FUNCTION public.work_status() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.work_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_status() TO authenticated;
