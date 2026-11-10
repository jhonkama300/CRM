-- ============================================================
-- 103_deals_conversation_on_delete_set_null.sql
--
-- Deleting a conversation used to fail when a sales deal still
-- referenced it: deals_conversation_id_fkey had no ON DELETE action.
-- A deal is business data and should survive inbox cleanup, so keep
-- the deal and clear only its conversation link.
-- ============================================================

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_conversation_id_fkey;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_conversation_id_fkey
  FOREIGN KEY (conversation_id)
  REFERENCES public.conversations(id)
  ON DELETE SET NULL;
