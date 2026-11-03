-- ============================================================
-- 079_drop_legacy_dashboard_overview.sql
--
-- 059 created dashboard_overview(integer, text). 072 added the
-- channel-aware dashboard_overview(integer, text, uuid) and replaced
-- that implementation, but left the two-argument overload in place.
-- With both functions present, a PostgREST call that omits
-- p_channel_id is ambiguous and fails with PGRST203 ("function ... is
-- not unique"), which surfaces in the dashboard as an empty {}
-- error. Dropping the legacy signature leaves the three-argument
-- version as the only candidate; its defaults keep two-argument calls
-- working.
-- ============================================================

DROP FUNCTION IF EXISTS public.dashboard_overview(integer, text);
