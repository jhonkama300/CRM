-- ============================================================
-- 066_conversation_departments.sql
--
-- Route conversations to the department that owns their channel.
-- This is the safe half of Phase 3: it adds visibility metadata and
-- keeps it in sync without changing existing RLS yet.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS department_id uuid
    REFERENCES departments(id) ON DELETE SET NULL;

UPDATE conversations c
SET department_id = ch.department_id
FROM channels ch
WHERE c.department_id IS NULL
  AND c.channel_id = ch.id;

CREATE INDEX IF NOT EXISTS idx_conversations_department
  ON conversations(department_id);

CREATE OR REPLACE FUNCTION public.set_conversation_department_from_channel()
RETURNS trigger AS $$
BEGIN
  IF NEW.channel_id IS NOT NULL THEN
    SELECT department_id INTO NEW.department_id
    FROM public.channels
    WHERE id = NEW.channel_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversations_set_department ON conversations;
CREATE TRIGGER conversations_set_department
  BEFORE INSERT OR UPDATE OF channel_id ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_conversation_department_from_channel();

CREATE OR REPLACE FUNCTION public.sync_channel_department_to_conversations()
RETURNS trigger AS $$
BEGIN
  UPDATE public.conversations
  SET department_id = NEW.department_id
  WHERE channel_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS channels_sync_department ON channels;
CREATE TRIGGER channels_sync_department
  AFTER UPDATE OF department_id ON channels
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_channel_department_to_conversations();
