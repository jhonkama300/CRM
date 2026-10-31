-- ============================================================
-- 074_channel_performance_anon_grant.sql
--
-- Supabase grants EXECUTE on new public functions to anon by
-- default. 070 revoked PUBLIC but not that explicit grant, leaving
-- channel_performance callable without a session. Tighten it.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.channel_performance(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.channel_performance(integer) TO authenticated;
