-- ============================================================
-- 083_assignee_must_belong_to_area.sql
--
-- Enforce the channel -> area -> members model at the database
-- boundary: a conversation can only be assigned to a member of the
-- channel's department (or one of its parent departments).
-- Channel/department-less conversations stay assignable to any
-- account member.
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_in_department_chain(
  p_user_id uuid,
  p_department_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT d.id, d.parent_id, d.account_id
    FROM public.departments d
    WHERE d.id = p_department_id
    UNION ALL
    SELECT d.id, d.parent_id, d.account_id
    FROM public.departments d
    JOIN chain ON d.id = chain.parent_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.department_members dm
    JOIN chain ON chain.id = dm.department_id
    WHERE dm.user_id = p_user_id
      AND dm.account_id = chain.account_id
  );
$$;

ALTER FUNCTION public.user_in_department_chain(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.user_in_department_chain(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_in_department_chain(uuid, uuid) TO authenticated;

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

DROP TRIGGER IF EXISTS conversations_assignee_area ON conversations;
CREATE TRIGGER conversations_assignee_area
  BEFORE INSERT OR UPDATE OF assigned_agent_id ON conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_assignee_area();
