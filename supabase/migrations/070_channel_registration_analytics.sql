-- ============================================================
-- 070_channel_registration_analytics.sql
--
-- Phase 4/5 closure:
--   * persist the fields needed to prove a channel is actually
--     registered for inbound webhooks (PIN /register + WABA
--     subscription), not merely credentialed;
--   * cache Meta phone health so the settings UI can show quality
--     without calling Graph on every render;
--   * expose per-channel performance for the dashboard range chips.
-- ============================================================

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS display_phone_number text;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS quality_rating text;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS messaging_limit text;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS registered_at timestamptz;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS last_registration_error text;

ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz;

CREATE OR REPLACE FUNCTION public.channel_performance(p_days int DEFAULT 7)
RETURNS TABLE (
  channel_id uuid,
  name text,
  color text,
  status text,
  display_phone_number text,
  quality_rating text,
  conversations int,
  open_conversations int,
  inbound int,
  outbound int,
  failed int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT now() - make_interval(days => GREATEST(COALESCE(p_days, 7), 1)) AS start_at
  )
  SELECT
    ch.id,
    ch.name,
    ch.color,
    ch.status,
    ch.display_phone_number,
    ch.quality_rating,
    COALESCE(stats.conversations, 0),
    COALESCE(stats.open_conversations, 0),
    COALESCE(stats.inbound, 0),
    COALESCE(stats.outbound, 0),
    COALESCE(stats.failed, 0)
  FROM public.channels ch
  CROSS JOIN bounds b
  LEFT JOIN LATERAL (
    SELECT
      (
        SELECT count(*)::int
        FROM public.conversations c
        WHERE c.channel_id = ch.id
          AND c.created_at >= b.start_at
      ) AS conversations,
      (
        SELECT count(*)::int
        FROM public.conversations c
        WHERE c.channel_id = ch.id
          AND c.status = 'open'
      ) AS open_conversations,
      (
        SELECT count(*)::int
        FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE c.channel_id = ch.id
          AND m.sender_type = 'customer'
          AND m.created_at >= b.start_at
      ) AS inbound,
      (
        SELECT count(*)::int
        FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE c.channel_id = ch.id
          AND m.sender_type IN ('agent', 'bot')
          AND m.created_at >= b.start_at
      ) AS outbound,
      (
        SELECT count(*)::int
        FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE c.channel_id = ch.id
          AND m.status = 'failed'
          AND m.created_at >= b.start_at
      ) AS failed
  ) stats ON TRUE
  WHERE public.is_account_member(ch.account_id)
  ORDER BY ch.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.channel_performance(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.channel_performance(int) TO authenticated;

-- Primary channels created by the whatsapp_config sync trigger should
-- inherit registration state from the legacy config, so the settings
-- card does not say "Not registered" for an already-live primary number.
UPDATE public.channels ch
SET
  registered_at = COALESCE(ch.registered_at, wc.registered_at),
  subscribed_at = COALESCE(ch.subscribed_at, wc.subscribed_apps_at),
  last_registration_error = COALESCE(ch.last_registration_error, wc.last_registration_error)
FROM public.whatsapp_config wc
WHERE ch.source_config_id = wc.id
  AND (
    ch.registered_at IS NULL
    OR ch.subscribed_at IS NULL
    OR ch.last_registration_error IS NULL
  );
