-- ============================================================
-- 069_templates_broadcasts_channels.sql
--
-- Phase 4: templates and broadcasts become channel-aware. Existing rows
-- are attached to the primary channel; new rows without an explicit
-- channel fall back to the primary channel via a trigger, so existing
-- callers keep working.
-- ============================================================

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE SET NULL;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE SET NULL;

UPDATE message_templates mt
SET channel_id = ch.id
FROM channels ch
WHERE mt.channel_id IS NULL
  AND ch.account_id = mt.account_id
  AND ch.source_config_id IS NOT NULL;

UPDATE broadcasts b
SET channel_id = ch.id
FROM channels ch
WHERE b.channel_id IS NULL
  AND ch.account_id = b.account_id
  AND ch.source_config_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_message_templates_channel
  ON message_templates(channel_id);

CREATE INDEX IF NOT EXISTS idx_broadcasts_channel
  ON broadcasts(channel_id);

DROP INDEX IF EXISTS message_templates_account_name_language_key;
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_account_channel_name_language_key
  ON message_templates(account_id, channel_id, name, language);

CREATE OR REPLACE FUNCTION public.default_channel_for_account(p_account_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.channels
  WHERE account_id = p_account_id
  ORDER BY (source_config_id IS NOT NULL) DESC, created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_default_template_channel()
RETURNS trigger AS $$
BEGIN
  IF NEW.channel_id IS NULL THEN
    NEW.channel_id := public.default_channel_for_account(NEW.account_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS message_templates_default_channel ON message_templates;
CREATE TRIGGER message_templates_default_channel
  BEFORE INSERT ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_template_channel();

CREATE OR REPLACE FUNCTION public.set_default_broadcast_channel()
RETURNS trigger AS $$
BEGIN
  IF NEW.channel_id IS NULL THEN
    NEW.channel_id := public.default_channel_for_account(NEW.account_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS broadcasts_default_channel ON broadcasts;
CREATE TRIGGER broadcasts_default_channel
  BEFORE INSERT ON broadcasts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_broadcast_channel();
