-- ============================================================
-- 102_department_access_pipelines_deals.sql
--
-- A funnel belongs to a WhatsApp channel, and the channel belongs to
-- a department. Members of that department should see the funnel's
-- deals and the conversations received by its channel, even when
-- private-inbox visibility is enabled.
--
-- Department membership is already the access boundary for channels
-- (can_access_channel). This migration extends the same boundary to
-- pipelines, pipeline stages and deals, and treats channel access as
-- sufficient inbox access for department agents.
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_pipeline(p_pipeline_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pipelines p
    WHERE p.id = p_pipeline_id
      AND public.is_account_member(p.account_id)
      AND (
        p.channel_id IS NULL
        OR public.can_access_channel(p.channel_id)
      )
  );
$$;

ALTER FUNCTION public.can_access_pipeline(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_access_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_pipeline(uuid) TO authenticated, service_role;

-- Pipelines: department members only see funnels whose channel they
-- can access. Funnels without a channel stay account-wide.
DROP POLICY IF EXISTS pipelines_select ON public.pipelines;
CREATE POLICY pipelines_select ON public.pipelines FOR SELECT
  USING (
    is_account_member(account_id)
    AND (channel_id IS NULL OR can_access_channel(channel_id))
  );

DROP POLICY IF EXISTS pipeline_stages_select ON public.pipeline_stages;
CREATE POLICY pipeline_stages_select ON public.pipeline_stages FOR SELECT
  USING (can_access_pipeline(pipeline_id));

-- Deals: visibility and writes follow the funnel's channel department.
DROP POLICY IF EXISTS deals_select ON public.deals;
CREATE POLICY deals_select ON public.deals FOR SELECT
  USING (is_account_member(account_id) AND can_access_pipeline(pipeline_id));

DROP POLICY IF EXISTS deals_insert ON public.deals;
CREATE POLICY deals_insert ON public.deals FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND can_access_pipeline(pipeline_id)
  );

DROP POLICY IF EXISTS deals_update ON public.deals;
CREATE POLICY deals_update ON public.deals FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND can_access_pipeline(pipeline_id)
  )
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND can_access_pipeline(pipeline_id)
  );

DROP POLICY IF EXISTS deals_delete ON public.deals;
CREATE POLICY deals_delete ON public.deals FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND can_access_pipeline(pipeline_id)
  );

-- Conversations: a member of the channel's department can see and
-- work every thread on that channel. Private inbox still applies to
-- conversations without a channel.
DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations FOR SELECT
  USING (
    is_account_member(account_id)
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (
      assigned_agent_id = auth.uid()
      OR is_conversation_participant(conversations.id)
      OR has_full_inbox_access(account_id)
      OR (channel_id IS NOT NULL AND can_access_channel(channel_id))
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
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (
      assigned_agent_id = auth.uid()
      OR is_conversation_participant(conversations.id)
      OR has_full_inbox_access(account_id)
      OR (channel_id IS NOT NULL AND can_access_channel(channel_id))
    )
  )
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (
      assigned_agent_id = auth.uid()
      OR is_conversation_participant(conversations.id)
      OR has_full_inbox_access(account_id)
      OR (channel_id IS NOT NULL AND can_access_channel(channel_id))
    )
  );

DROP POLICY IF EXISTS conversations_delete ON public.conversations;
CREATE POLICY conversations_delete ON public.conversations FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND (channel_id IS NULL OR can_access_channel(channel_id))
    AND (
      assigned_agent_id = auth.uid()
      OR is_conversation_participant(conversations.id)
      OR has_full_inbox_access(account_id)
      OR (channel_id IS NOT NULL AND can_access_channel(channel_id))
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
        AND (c.channel_id IS NULL OR can_access_channel(c.channel_id))
        AND (
          c.assigned_agent_id = auth.uid()
          OR is_conversation_participant(c.id)
          OR has_full_inbox_access(c.account_id)
          OR (c.channel_id IS NOT NULL AND can_access_channel(c.channel_id))
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
        AND (c.channel_id IS NULL OR can_access_channel(c.channel_id))
        AND (
          c.assigned_agent_id = auth.uid()
          OR is_conversation_participant(c.id)
          OR has_full_inbox_access(c.account_id)
          OR (c.channel_id IS NOT NULL AND can_access_channel(c.channel_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id, 'agent')
        AND (c.channel_id IS NULL OR can_access_channel(c.channel_id))
        AND (
          c.assigned_agent_id = auth.uid()
          OR is_conversation_participant(c.id)
          OR has_full_inbox_access(c.account_id)
          OR (c.channel_id IS NOT NULL AND can_access_channel(c.channel_id))
        )
    )
  );

-- Single-channel accounts: attach legacy null-channel conversations to
-- their only channel so department access applies to them too.
UPDATE public.conversations c
SET channel_id = ch.id
FROM public.channels ch
WHERE c.channel_id IS NULL
  AND ch.account_id = c.account_id
  AND (
    SELECT count(*)
    FROM public.channels ch2
    WHERE ch2.account_id = c.account_id
  ) = 1;
