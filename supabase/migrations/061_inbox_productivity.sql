-- ============================================================
-- 061_inbox_productivity.sql
--
-- Inbox-level controls that don't fit the conversation status enum:
--   - is_pinned     pin important threads to the top
--   - snoozed_until hide/remind a thread until a chosen time
--   - follow_up_at  agent-set reminder for a later follow-up
--
-- Media reprocessing also needs the original Meta media id. Until now
-- the webhook only stored the proxied/mirrored URL, so a failed media
-- download could never be retried without re-reading Meta's payload.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_account_pinned
  ON conversations(account_id, is_pinned, last_message_at DESC);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS meta_media_id text;
