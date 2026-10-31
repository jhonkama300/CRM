-- ============================================================
-- 065_channels.sql
--
-- Introduce the channels table as the multi-number source of truth.
-- The existing whatsapp_config row is copied into a "Principal" channel
-- and kept in sync by a trigger, so the current single-number setup keeps
-- working while additional numbers can be added.
-- ============================================================

CREATE TABLE IF NOT EXISTS channels (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  department_id         uuid REFERENCES departments(id) ON DELETE SET NULL,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_config_id      uuid UNIQUE REFERENCES whatsapp_config(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  color                 text NOT NULL DEFAULT '#25D366',
  phone_number_id       text NOT NULL UNIQUE,
  waba_id               text,
  access_token          text NOT NULL,
  verify_token          text,
  status                text NOT NULL DEFAULT 'disconnected'
                          CHECK (status IN ('connected', 'disconnected')),
  mirror_inbound_media  boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channels_account
  ON channels(account_id, created_at);

CREATE INDEX IF NOT EXISTS idx_channels_department
  ON channels(department_id);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channels_select ON channels;
CREATE POLICY channels_select ON channels FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS channels_insert ON channels;
CREATE POLICY channels_insert ON channels FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS channels_update ON channels;
CREATE POLICY channels_update ON channels FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS channels_delete ON channels;
CREATE POLICY channels_delete ON channels FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS channels_updated_at ON channels;
CREATE TRIGGER channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed from the existing single-number config.
INSERT INTO channels (
  account_id,
  user_id,
  source_config_id,
  name,
  phone_number_id,
  waba_id,
  access_token,
  verify_token,
  status,
  mirror_inbound_media
)
SELECT
  account_id,
  user_id,
  id,
  'Principal',
  phone_number_id,
  waba_id,
  access_token,
  verify_token,
  status,
  COALESCE(mirror_inbound_media, true)
FROM whatsapp_config
ON CONFLICT (phone_number_id) DO NOTHING;

-- Keep the primary channel credentials in sync with the existing
-- settings form until the channel UI fully replaces it.
CREATE OR REPLACE FUNCTION public.sync_whatsapp_config_to_channel()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.channels (
    account_id,
    user_id,
    source_config_id,
    name,
    phone_number_id,
    waba_id,
    access_token,
    verify_token,
    status,
    mirror_inbound_media
  ) VALUES (
    NEW.account_id,
    NEW.user_id,
    NEW.id,
    'Principal',
    NEW.phone_number_id,
    NEW.waba_id,
    NEW.access_token,
    NEW.verify_token,
    NEW.status,
    COALESCE(NEW.mirror_inbound_media, true)
  )
  ON CONFLICT (source_config_id) DO UPDATE SET
    account_id = EXCLUDED.account_id,
    user_id = EXCLUDED.user_id,
    phone_number_id = EXCLUDED.phone_number_id,
    waba_id = EXCLUDED.waba_id,
    access_token = EXCLUDED.access_token,
    verify_token = EXCLUDED.verify_token,
    status = EXCLUDED.status,
    mirror_inbound_media = EXCLUDED.mirror_inbound_media;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whatsapp_config_sync_channel ON whatsapp_config;
CREATE TRIGGER whatsapp_config_sync_channel
  AFTER INSERT OR UPDATE ON whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_whatsapp_config_to_channel();

-- Conversations now belong to a channel. Backfill existing rows to the
-- seeded primary channel.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE SET NULL;

UPDATE conversations c
SET channel_id = ch.id
FROM channels ch
WHERE c.channel_id IS NULL
  AND ch.source_config_id IS NOT NULL
  AND ch.account_id = c.account_id;

CREATE INDEX IF NOT EXISTS idx_conversations_channel
  ON conversations(channel_id);

-- One thread per contact per channel. Existing rows were backfilled, so
-- the replacement index is safe.
DROP INDEX IF EXISTS idx_conversations_account_contact;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_account_contact_channel
  ON conversations(account_id, contact_id, channel_id);
