-- ============================================================
-- 100_message_delivery_timestamps.sql
--
-- Persist the Meta status timestamps for outbound messages so the
-- inbox can explain exactly when a message was delivered and read.
-- ============================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
