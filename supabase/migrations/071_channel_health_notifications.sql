-- ============================================================
-- 071_channel_health_notifications.sql
--
-- Phase 5: a scheduled channel health sweep can now alert account
-- admins when a channel disconnects, its token expires, or Meta
-- downgrades the number's quality rating to RED.
-- ============================================================

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE CASCADE;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'channel_health'));

CREATE INDEX IF NOT EXISTS idx_notifications_channel_created
  ON notifications(channel_id, created_at DESC)
  WHERE channel_id IS NOT NULL;
