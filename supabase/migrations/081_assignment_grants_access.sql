-- ============================================================
-- 081_assignment_grants_access.sql
--
-- Explicit assignment must win over the channel/department filter.
-- Before this, an agent in "assigned only" mode could be assigned a
-- conversation on a department-restricted channel and still not see
-- it, because conversations_select required BOTH the assignment and
-- can_access_channel(). Assignment is an explicit grant: the assignee
-- can see and work that thread even when the channel belongs to
-- another department. Full-inbox members still need channel access.
-- ============================================================

DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT
  USING (
    is_account_member(account_id)
    AND (
      assigned_agent_id = auth.uid()
      OR (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND has_full_inbox_access(account_id)
      )
    )
  );

DROP POLICY IF EXISTS conversations_insert ON conversations;
CREATE POLICY conversations_insert ON conversations FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (
      assigned_agent_id = auth.uid()
      OR (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND has_full_inbox_access(account_id)
      )
    )
  );

DROP POLICY IF EXISTS conversations_update ON conversations;
CREATE POLICY conversations_update ON conversations FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND (
      assigned_agent_id = auth.uid()
      OR (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND has_full_inbox_access(account_id)
      )
    )
  )
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (
      assigned_agent_id = auth.uid()
      OR (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND has_full_inbox_access(account_id)
      )
    )
  );

DROP POLICY IF EXISTS conversations_delete ON conversations;
CREATE POLICY conversations_delete ON conversations FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND (
      assigned_agent_id = auth.uid()
      OR (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND has_full_inbox_access(account_id)
      )
    )
  );

DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id)
        AND (
          c.assigned_agent_id = auth.uid()
          OR (
            (c.channel_id IS NULL OR can_access_channel(c.channel_id))
            AND has_full_inbox_access(c.account_id)
          )
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
        AND (
          c.assigned_agent_id = auth.uid()
          OR (
            (c.channel_id IS NULL OR can_access_channel(c.channel_id))
            AND has_full_inbox_access(c.account_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id, 'agent')
        AND (
          c.assigned_agent_id = auth.uid()
          OR (
            (c.channel_id IS NULL OR can_access_channel(c.channel_id))
            AND has_full_inbox_access(c.account_id)
          )
        )
    )
  );
