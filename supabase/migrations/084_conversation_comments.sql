-- ============================================================
-- 084_conversation_comments.sql
--
-- Phase 6: internal conversation comments with @mentions. Comments
-- live beside the thread, are never sent to WhatsApp, and inherit
-- the conversation's visibility rules through RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id     uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body                text NOT NULL,
  mentioned_user_ids  uuid[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_comments_conversation
  ON conversation_comments(conversation_id, created_at DESC);

ALTER TABLE conversation_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_comments_select ON conversation_comments;
CREATE POLICY conversation_comments_select ON conversation_comments FOR SELECT
  USING (
    is_account_member(account_id)
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_comments.conversation_id
        AND is_account_member(c.account_id)
    )
  );

DROP POLICY IF EXISTS conversation_comments_insert ON conversation_comments;
CREATE POLICY conversation_comments_insert ON conversation_comments FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_comments.conversation_id
        AND is_account_member(c.account_id)
    )
  );

DROP POLICY IF EXISTS conversation_comments_delete ON conversation_comments;
CREATE POLICY conversation_comments_delete ON conversation_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_account_member(account_id, 'admin')
  );

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'channel_health', 'mention', 'comment_mention'));

CREATE OR REPLACE FUNCTION public.notify_conversation_comment_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_name text;
  v_contact_id uuid;
  v_user uuid;
BEGIN
  IF NEW.mentioned_user_ids IS NULL
     OR cardinality(NEW.mentioned_user_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_author_name
  FROM profiles
  WHERE user_id = NEW.user_id;

  SELECT contact_id INTO v_contact_id
  FROM conversations
  WHERE id = NEW.conversation_id;

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
      conversation_id,
      contact_id,
      actor_user_id,
      title,
      body
    ) VALUES (
      NEW.account_id,
      v_user,
      'comment_mention',
      NEW.conversation_id,
      v_contact_id,
      NEW.user_id,
      'You were mentioned in an internal comment',
      COALESCE(v_author_name, 'Someone') || ': ' || left(NEW.body, 180)
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to notify comment mentions for comment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_conversation_comment_mentions() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notify_conversation_comment_mentions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_conversation_comment_mentions ON conversation_comments;
CREATE TRIGGER on_conversation_comment_mentions
  AFTER INSERT ON conversation_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_conversation_comment_mentions();
