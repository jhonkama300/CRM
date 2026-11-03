-- ============================================================
-- 088_assignee_area_admin_bypass.sql
--
-- 083 added conversations_assignee_area so a conversation can only be
-- assigned to a member of the channel's department chain. It forgot
-- that owners/admins are allowed to see every channel regardless of
-- department (can_access_channel() has always had that bypass).
--
-- The visible bug: in the inbox, an owner clicks "Take over" on a
-- thread answered by the AI. The route assigns the thread to the
-- caller, the trigger checks department_members, finds the owner is
-- not listed there, raises 23514, and the API returns 500 - even
-- though the owner was already allowed to read and work that thread.
--
-- Mirror can_access_channel(): an owner/admin assignee is always
-- allowed. Agents still have to belong to the channel's area.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_conversation_assignee_area()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_department_id uuid;
BEGIN
  IF NEW.assigned_agent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
    RETURN NEW;
  END IF;
  IF NEW.channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Owners/admins bypass the department filter when reading channels,
  -- so assigning a thread to them must not be blocked by it either.
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = NEW.assigned_agent_id
      AND p.account_id = NEW.account_id
      AND p.account_role IN ('owner', 'admin')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT department_id INTO v_department_id
  FROM channels
  WHERE id = NEW.channel_id;

  IF v_department_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.user_in_department_chain(NEW.assigned_agent_id, v_department_id) THEN
    RAISE EXCEPTION 'Assignee must belong to the channel area'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_conversation_assignee_area() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_conversation_assignee_area() FROM PUBLIC, anon, authenticated;
