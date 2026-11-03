-- ============================================================
-- 091_pipeline_channels.sql
--
-- A pipeline may be linked to one WhatsApp channel. Channels are
-- already scoped to a department, so this also gives the pipeline an
-- area through its channel. NULL keeps the pipeline account-wide.
-- ============================================================

ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS channel_id uuid
    REFERENCES channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipelines_channel
  ON pipelines(channel_id);

CREATE INDEX IF NOT EXISTS idx_pipelines_account_channel
  ON pipelines(account_id, channel_id);
