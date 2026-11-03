-- ============================================================
-- 082_revert_assignment_override.sql
--
-- Revert 081. Channel responsibility is area-based: only members
-- of the channel's department (or an admin) can access its threads.
-- Assigning a conversation to somebody outside that area must not
-- silently grant channel access; add them to the area first.
-- ============================================================

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
