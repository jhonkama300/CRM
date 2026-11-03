-- ============================================================
-- 091_list_my_sessions.sql
--
-- The security panel can show the devices signed into the current
-- account. Supabase stores those in `auth.sessions`, which PostgREST
-- does not expose; this SECURITY DEFINER RPC returns only the caller's
-- own rows (never another user's) plus a flag for the session behind
-- the current access token.
--
-- IP + user agent are device metadata, not secrets: they are shown
-- back to the same user so they can spot a login they don't recognise.
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_my_sessions()
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  ip text,
  user_agent text,
  is_current boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.created_at,
    s.updated_at,
    host(s.ip) AS ip,
    s.user_agent,
    s.id = (
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'session_id'
    )::uuid AS is_current
  FROM auth.sessions s
  WHERE s.user_id = auth.uid()
  ORDER BY s.updated_at DESC;
$$;

ALTER FUNCTION public.list_my_sessions() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_my_sessions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_sessions() TO authenticated;
