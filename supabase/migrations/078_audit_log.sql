-- ============================================================
-- 078_audit_log.sql
--
-- Phase 6: append-only audit trail for destructive and
-- configuration-changing actions. Inserts go through the service
-- role from server routes; members can only read their account's
-- rows, and only admins/owners can do that.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actor_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_account_created
  ON audit_logs(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_account_action
  ON audit_logs(account_id, action, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (is_account_member(account_id, 'admin'));

-- No client insert/update/delete policies. The service role bypasses
-- RLS and is the only writer, so the trail cannot be edited from the
-- dashboard.
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM authenticated, anon;
GRANT SELECT ON audit_logs TO authenticated;
