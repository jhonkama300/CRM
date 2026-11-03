-- ============================================================
-- 076_private_inboxes.sql
--
-- Phase 6: per-member inbox visibility.
--
--   account  - see every conversation the member's channels allow
--              (historic behaviour, default).
--   assigned - see only conversations assigned to them; admins and
--              owners always keep full inbox access.
--
-- The switch is enforced in RLS for conversations and messages, not
-- just in the UI, so a restricted agent cannot read another agent's
-- threads through the API or realtime channels.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS inbox_visibility TEXT NOT NULL DEFAULT 'account';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_inbox_visibility_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_inbox_visibility_check
  CHECK (inbox_visibility IN ('account', 'assigned'));

CREATE OR REPLACE FUNCTION public.has_full_inbox_access(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = p_account_id
      AND (
        p.account_role IN ('owner', 'admin')
        OR p.inbox_visibility = 'account'
      )
  );
$$;

ALTER FUNCTION public.has_full_inbox_access(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_full_inbox_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_full_inbox_access(uuid) TO authenticated;

-- Conversations -----------------------------------------------------------------
DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT
  USING (
    is_account_member(account_id)
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (has_full_inbox_access(account_id) OR assigned_agent_id = auth.uid())
  );

DROP POLICY IF EXISTS conversations_insert ON conversations;
CREATE POLICY conversations_insert ON conversations FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (has_full_inbox_access(account_id) OR assigned_agent_id = auth.uid())
  );

DROP POLICY IF EXISTS conversations_update ON conversations;
CREATE POLICY conversations_update ON conversations FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (has_full_inbox_access(account_id) OR assigned_agent_id = auth.uid())
  )
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (has_full_inbox_access(account_id) OR assigned_agent_id = auth.uid())
  );

DROP POLICY IF EXISTS conversations_delete ON conversations;
CREATE POLICY conversations_delete ON conversations FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (has_full_inbox_access(account_id) OR assigned_agent_id = auth.uid())
  );

-- Messages inherit the conversation's visibility. -------------------------------
DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id)
        AND (c.channel_id IS NULL OR can_access_channel(c.channel_id))
        AND (
          has_full_inbox_access(c.account_id)
          OR c.assigned_agent_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS messages_modify ON messages;
CREATE POLICY messages_modify ON messages FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id, 'agent')
        AND (c.channel_id IS NULL OR can_access_channel(c.channel_id))
        AND (
          has_full_inbox_access(c.account_id)
          OR c.assigned_agent_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id, 'agent')
        AND (c.channel_id IS NULL OR can_access_channel(c.channel_id))
        AND (
          has_full_inbox_access(c.account_id)
          OR c.assigned_agent_id = auth.uid()
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent
  ON conversations(assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;

-- Admin-only RPC used by Settings -> Members. -----------------------------------
CREATE OR REPLACE FUNCTION public.set_member_inbox_visibility(
  p_user_id uuid,
  p_visibility text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_account uuid;
  v_caller_role account_role_enum;
  v_target_account uuid;
  v_target_role account_role_enum;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, account_role
  INTO v_caller_account, v_caller_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_caller_account IS NULL
     OR v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only admins can change inbox visibility'
      USING ERRCODE = '42501';
  END IF;

  IF p_visibility NOT IN ('account', 'assigned') THEN
    RAISE EXCEPTION 'Invalid inbox visibility' USING ERRCODE = '22023';
  END IF;

  SELECT account_id, account_role
  INTO v_target_account, v_target_role
  FROM profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_target_account IS NULL OR v_target_account <> v_caller_account THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = '42501';
  END IF;

  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'The owner always has full inbox access'
      USING ERRCODE = '22023';
  END IF;

  UPDATE profiles
  SET inbox_visibility = p_visibility
  WHERE user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.set_member_inbox_visibility(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_inbox_visibility(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_inbox_visibility(uuid, text) TO authenticated;
