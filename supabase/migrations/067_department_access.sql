-- ============================================================
-- 067_department_access.sql
--
-- Phase 3 access control: conversations, messages and channels are
-- visible to company admins and to members of the department that owns
-- the channel (including its parent departments). Unassigned channels
-- stay visible to every account member, so existing setups do not lose
-- data until an admin explicitly assigns a channel to a department.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.channels ch
    WHERE ch.id = p_channel_id
      AND public.is_account_member(ch.account_id)
      AND (
        public.is_account_member(ch.account_id, 'admin')
        OR ch.department_id IS NULL
        OR EXISTS (
          WITH RECURSIVE chain AS (
            SELECT d.id, d.parent_id
            FROM public.departments d
            WHERE d.id = ch.department_id
            UNION ALL
            SELECT d.id, d.parent_id
            FROM public.departments d
            JOIN chain ON d.id = chain.parent_id
          )
          SELECT 1
          FROM public.department_members dm
          JOIN chain ON chain.id = dm.department_id
          WHERE dm.user_id = auth.uid()
        )
      )
  );
$$;

ALTER FUNCTION public.can_access_channel(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_access_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_channel(uuid) TO authenticated;

-- Conversations
DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT
  USING (
    is_account_member(account_id)
    AND (channel_id IS NULL OR can_access_channel(channel_id))
  );

DROP POLICY IF EXISTS conversations_insert ON conversations;
CREATE POLICY conversations_insert ON conversations FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
  );

DROP POLICY IF EXISTS conversations_update ON conversations;
CREATE POLICY conversations_update ON conversations FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
  );

DROP POLICY IF EXISTS conversations_delete ON conversations;
CREATE POLICY conversations_delete ON conversations FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
  );

-- Messages inherit their conversation's visibility.
DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id)
        AND (c.channel_id IS NULL OR can_access_channel(c.channel_id))
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
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id, 'agent')
        AND (c.channel_id IS NULL OR can_access_channel(c.channel_id))
    )
  );

-- Channels themselves. Unassigned channels remain visible to everyone.
DROP POLICY IF EXISTS channels_select ON channels;
CREATE POLICY channels_select ON channels FOR SELECT
  USING (is_account_member(account_id) AND can_access_channel(id));
