-- ============================================================
-- 097_conversation_closed_by.sql
--
-- Record who finalized a conversation so the inbox can show
-- "Finalizada por ..." instead of an anonymous closed state.
-- Manual closes, bulk closes and pipeline wins set this column;
-- automation closes leave it NULL and render as the system.
-- ============================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_closed_by_user_id
  ON public.conversations(closed_by_user_id)
  WHERE closed_by_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.stamp_conversation_closed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'closed' THEN
    NEW.closed_at := NULL;
    NEW.closed_by_user_id := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  ELSIF OLD.status IS DISTINCT FROM 'closed' THEN
    NEW.closed_at := now();
  ELSE
    NEW.closed_at := COALESCE(OLD.closed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.stamp_conversation_closed_at() OWNER TO postgres;

DROP TRIGGER IF EXISTS conversations_stamp_closed_at ON public.conversations;
CREATE TRIGGER conversations_stamp_closed_at
  BEFORE INSERT OR UPDATE OF status ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_conversation_closed_at();
