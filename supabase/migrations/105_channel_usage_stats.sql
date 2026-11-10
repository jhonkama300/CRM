-- ============================================================
-- 105_channel_usage_stats.sql
--
-- Real per-channel messaging usage from the data JOTIX already stores.
-- Costs are intentionally NULL until Meta reports actual charges or
-- an administrator configures a rate card; the API exposes that gap
-- instead of inventing numbers.
-- ============================================================

CREATE OR REPLACE FUNCTION public.channel_usage_stats(
  p_channel_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT (now() - interval '7 days'),
  p_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      m.id,
      m.created_at,
      m.sender_type,
      m.content_type,
      m.status,
      m.template_name,
      c.contact_id,
      c.channel_id,
      CASE
        WHEN m.sender_type = 'customer' THEN 'service'
        WHEN m.content_type = 'template' THEN COALESCE((
          SELECT lower(mt.category)
          FROM public.message_templates mt
          WHERE mt.account_id = c.account_id
            AND mt.name = m.template_name
          ORDER BY (mt.channel_id = c.channel_id) DESC NULLS LAST
          LIMIT 1
        ), 'unknown')
        ELSE 'service'
      END AS billing_category
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE (p_channel_id IS NULL OR c.channel_id = p_channel_id)
      AND m.created_at >= p_from
      AND m.created_at <= p_to
  ),
  totals AS (
    SELECT
      count(*) FILTER (WHERE sender_type <> 'customer') AS sent,
      count(*) FILTER (WHERE sender_type = 'customer') AS received,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'delivered') AS delivered,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'read') AS read,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'failed') AS failed,
      count(*) FILTER (WHERE billing_category = 'marketing') AS marketing,
      count(*) FILTER (WHERE billing_category = 'utility') AS utility,
      count(*) FILTER (WHERE billing_category = 'authentication') AS authentication,
      count(*) FILTER (WHERE billing_category = 'service') AS service,
      count(*) FILTER (WHERE billing_category = 'unknown') AS unknown
    FROM scoped
  ),
  daily AS (
    SELECT
      date_trunc('day', created_at) AS day,
      count(*) FILTER (WHERE sender_type <> 'customer') AS sent,
      count(*) FILTER (WHERE sender_type = 'customer') AS received,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'delivered') AS delivered,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'read') AS read,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'failed') AS failed,
      count(*) FILTER (WHERE billing_category = 'marketing') AS marketing,
      count(*) FILTER (WHERE billing_category = 'utility') AS utility,
      count(*) FILTER (WHERE billing_category = 'authentication') AS authentication,
      count(*) FILTER (WHERE billing_category = 'service') AS service,
      count(*) FILTER (WHERE billing_category = 'unknown') AS unknown
    FROM scoped
    GROUP BY day
    ORDER BY day
  ),
  last_day AS (
    SELECT
      count(DISTINCT c.contact_id) AS unique_contacts_24h
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE (p_channel_id IS NULL OR c.channel_id = p_channel_id)
      AND m.created_at >= now() - interval '24 hours'
      AND m.sender_type <> 'customer'
      AND m.content_type = 'template'
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'sent', totals.sent,
      'received', totals.received,
      'delivered', totals.delivered,
      'read', totals.read,
      'failed', totals.failed
    ),
    'uniqueContacts24h', last_day.unique_contacts_24h,
    'categories', jsonb_build_object(
      'marketing', totals.marketing,
      'utility', totals.utility,
      'authentication', totals.authentication,
      'service', totals.service,
      'unknown', totals.unknown
    ),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'sent', sent,
        'received', received,
        'delivered', delivered,
        'read', read,
        'failed', failed,
        'marketing', marketing,
        'utility', utility,
        'authentication', authentication,
        'service', service,
        'unknown', unknown
      ) ORDER BY day)
      FROM daily
    ), '[]'::jsonb),
    'costs', jsonb_build_object(
      'available', false,
      'currency', 'COP',
      'estimatedTotalCop', NULL,
      'actualTotalCop', NULL,
      'reason', 'no_meta_cost_data'
    )
  )
  FROM totals, last_day;
$$;

ALTER FUNCTION public.channel_usage_stats(uuid, timestamptz, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.channel_usage_stats(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.channel_usage_stats(uuid, timestamptz, timestamptz) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_messages_created_at_conversation
  ON public.messages(created_at, conversation_id);
