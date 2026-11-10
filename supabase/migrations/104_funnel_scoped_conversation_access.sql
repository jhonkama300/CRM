-- ============================================================
-- 104_funnel_scoped_conversation_access.sql
--
-- Department membership should not expose every conversation on a
-- channel. Agents see a thread only when:
--   * it is assigned to them / they participate in it, with normal
--     channel access, or
--   * it is linked to a deal in a funnel they can access.
--
-- Owners/admins keep account-wide access through the existing
-- full-inbox + channel-access rules.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_conversation_via_pipeline(
  p_conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deals d
    WHERE d.conversation_id = p_conversation_id
      AND public.can_access_pipeline(d.pipeline_id)
  );
$$;

ALTER FUNCTION public.can_access_conversation_via_pipeline(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_access_conversation_via_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_conversation_via_pipeline(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations FOR SELECT
  USING (
    is_account_member(account_id)
    AND (
      (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND (
          assigned_agent_id = auth.uid()
          OR is_conversation_participant(conversations.id)
          OR has_full_inbox_access(account_id)
        )
      )
      OR can_access_conversation_via_pipeline(conversations.id)
    )
  );

DROP POLICY IF EXISTS conversations_insert ON public.conversations;
CREATE POLICY conversations_insert ON public.conversations FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (
      assigned_agent_id = auth.uid()
      OR has_full_inbox_access(account_id)
      OR (channel_id IS NOT NULL AND can_access_channel(channel_id))
    )
  );

DROP POLICY IF EXISTS conversations_update ON public.conversations;
CREATE POLICY conversations_update ON public.conversations FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND (
      (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND (
          assigned_agent_id = auth.uid()
          OR is_conversation_participant(conversations.id)
          OR has_full_inbox_access(account_id)
        )
      )
      OR can_access_conversation_via_pipeline(conversations.id)
    )
  )
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (
      (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND (
          assigned_agent_id = auth.uid()
          OR is_conversation_participant(conversations.id)
          OR has_full_inbox_access(account_id)
        )
      )
      OR can_access_conversation_via_pipeline(conversations.id)
    )
  );

DROP POLICY IF EXISTS conversations_delete ON public.conversations;
CREATE POLICY conversations_delete ON public.conversations FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND (
      (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND (
          assigned_agent_id = auth.uid()
          OR is_conversation_participant(conversations.id)
          OR has_full_inbox_access(account_id)
        )
      )
      OR can_access_conversation_via_pipeline(conversations.id)
    )
  );

DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id)
        AND (
          (
            (c.channel_id IS NULL OR can_access_channel(c.channel_id))
            AND (
              c.assigned_agent_id = auth.uid()
              OR is_conversation_participant(c.id)
              OR has_full_inbox_access(c.account_id)
            )
          )
          OR can_access_conversation_via_pipeline(c.id)
        )
    )
  );

DROP POLICY IF EXISTS messages_modify ON public.messages;
CREATE POLICY messages_modify ON public.messages FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id, 'agent')
        AND (
          (
            (c.channel_id IS NULL OR can_access_channel(c.channel_id))
            AND (
              c.assigned_agent_id = auth.uid()
              OR is_conversation_participant(c.id)
              OR has_full_inbox_access(c.account_id)
            )
          )
          OR can_access_conversation_via_pipeline(c.id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id, 'agent')
        AND (
          (
            (c.channel_id IS NULL OR can_access_channel(c.channel_id))
            AND (
              c.assigned_agent_id = auth.uid()
              OR is_conversation_participant(c.id)
              OR has_full_inbox_access(c.account_id)
            )
          )
          OR can_access_conversation_via_pipeline(c.id)
        )
    )
  );
