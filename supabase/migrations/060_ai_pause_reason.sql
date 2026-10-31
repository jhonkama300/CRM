-- ============================================================
-- 060_ai_pause_reason.sql - explain why the AI bot paused a conversation
--
-- `ai_autoreply_disabled` already says *that* the bot is paused on a
-- thread. This adds *why*, so the inbox can explain the state instead of
-- showing a generic "paused" banner:
--
--   handoff          - the model asked for a human
--   empty_response   - the provider returned no usable text
--   quota            - the provider rejected the call for rate/quota limits
--   provider_error   - invalid key or another hard provider failure
--   manual           - an agent took over from the inbox
--
-- NULL means the row predates this column (or the bot has never paused).
-- `ai_paused_at` lets the UI show how long the thread has been paused.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_pause_reason text;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_paused_at timestamptz;

DO $$
BEGIN
  ALTER TABLE conversations
    ADD CONSTRAINT conversations_ai_pause_reason_check
    CHECK (
      ai_pause_reason IS NULL
      OR ai_pause_reason IN (
        'handoff',
        'empty_response',
        'quota',
        'provider_error',
        'manual'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
