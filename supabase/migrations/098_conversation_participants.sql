-- ============================================================
-- 098_conversation_participants.sql
--
-- Multiple agents can collaborate on one conversation. The primary
-- assignee stays in conversations.assigned_agent_id; participants are
-- additional agents explicitly added from the thread header.
--
-- Participants get the same read/write access as the assignee so a
-- hand-off or a second pair of eyes actually works under RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation
  ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
  ON public.conversation_participants(user_id);

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_conversation_participant(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS conversation_participants_select ON public.conversation_participants;
CREATE POLICY conversation_participants_select ON public.conversation_participants
  FOR SELECT
  USING (
    is_account_member(account_id)
    AND (
      has_full_inbox_access(account_id)
      OR user_id = auth.uid()
      OR is_conversation_participant(conversation_id)
      OR EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = conversation_id
          AND c.assigned_agent_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS conversation_participants_insert ON public.conversation_participants;
CREATE POLICY conversation_participants_insert ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (
      has_full_inbox_access(account_id)
      OR is_conversation_participant(conversation_id)
      OR EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = conversation_id
          AND c.assigned_agent_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = user_id
        AND p.account_id = account_id
    )
  );

DROP POLICY IF EXISTS conversation_participants_delete ON public.conversation_participants;
CREATE POLICY conversation_participants_delete ON public.conversation_participants
  FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND (
      has_full_inbox_access(account_id)
      OR is_conversation_participant(conversation_id)
      OR EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = conversation_id
          AND c.assigned_agent_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations FOR SELECT
  USING (
    is_account_member(account_id)
    AND (
      assigned_agent_id = auth.uid()
      OR is_conversation_participant(conversations.id)
      OR (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND has_full_inbox_access(account_id)
      )
    )
  );

DROP POLICY IF EXISTS conversations_update ON public.conversations;
CREATE POLICY conversations_update ON public.conversations FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    AND (
      assigned_agent_id = auth.uid()
      OR is_conversation_participant(conversations.id)
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
      OR is_conversation_participant(conversations.id)
      OR (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND has_full_inbox_access(account_id)
      )
    )
  );

DROP POLICY IF EXISTS conversations_delete ON public.conversations;
CREATE POLICY conversations_delete ON public.conversations FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND (
      assigned_agent_id = auth.uid()
      OR is_conversation_participant(conversations.id)
      OR (
        (channel_id IS NULL OR can_access_channel(channel_id))
        AND has_full_inbox_access(account_id)
      )
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
          c.assigned_agent_id = auth.uid()
          OR is_conversation_participant(c.id)
          OR (
            (c.channel_id IS NULL OR can_access_channel(c.channel_id))
            AND has_full_inbox_access(c.account_id)
          )
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
          c.assigned_agent_id = auth.uid()
          OR is_conversation_participant(c.id)
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
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND is_account_member(c.account_id, 'agent')
        AND (
          c.assigned_agent_id = auth.uid()
          OR is_conversation_participant(c.id)
          OR (
            (c.channel_id IS NULL OR can_access_channel(c.channel_id))
            AND has_full_inbox_access(c.account_id)
          )
        )
    )
  );
