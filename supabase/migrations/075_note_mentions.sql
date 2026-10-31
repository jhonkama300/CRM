-- ============================================================
-- 075_note_mentions.sql
--
-- Phase 6: internal @mentions on contact notes. The note row carries
-- the mentioned user ids, a trigger fans out notification rows, and
-- the notifications type check learns the new 'mention' type.
-- ============================================================

ALTER TABLE contact_notes
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_contact_notes_mentions
  ON contact_notes USING gin(mentioned_user_ids);

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'channel_health', 'mention'));

CREATE OR REPLACE FUNCTION public.notify_contact_note_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name TEXT;
  v_author_name TEXT;
  v_user UUID;
BEGIN
  IF NEW.mentioned_user_ids IS NULL
     OR cardinality(NEW.mentioned_user_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(name, ''), NULLIF(phone, ''), 'a contact')
  INTO v_contact_name
  FROM contacts
  WHERE id = NEW.contact_id
    AND account_id = NEW.account_id;

  SELECT full_name INTO v_author_name
  FROM profiles
  WHERE user_id = NEW.user_id;

  FOREACH v_user IN ARRAY NEW.mentioned_user_ids LOOP
    CONTINUE WHEN v_user IS NULL OR v_user = NEW.user_id;

    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = v_user
        AND account_id = NEW.account_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO notifications (
      account_id,
      user_id,
      type,
      contact_id,
      actor_user_id,
      title,
      body
    ) VALUES (
      NEW.account_id,
      v_user,
      'mention',
      NEW.contact_id,
      NEW.user_id,
      'You were mentioned in a note',
      COALESCE(v_author_name, 'Someone') || ' mentioned you on ' ||
        COALESCE(v_contact_name, 'a contact') || ': ' ||
        left(NEW.note_text, 180)
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A notification failure must never block saving the note.
  RAISE WARNING 'Failed to notify note mentions for note %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_contact_note_mentions() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notify_contact_note_mentions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_contact_note_mentions ON contact_notes;
CREATE TRIGGER on_contact_note_mentions
  AFTER INSERT ON contact_notes
  FOR EACH ROW EXECUTE FUNCTION public.notify_contact_note_mentions();
