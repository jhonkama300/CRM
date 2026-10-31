-- ============================================================
-- 068_channel_health.sql
--
-- Phase 5 channel health fields: the channels settings page can now
-- show when a channel was last validated and why it failed.
-- ============================================================

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS last_error text;
