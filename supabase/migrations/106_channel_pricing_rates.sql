-- ============================================================
-- 106_channel_pricing_rates.sql
--
-- Per-channel COP rate card for estimated Meta messaging costs.
-- Actual Meta charges are not exposed by the message webhooks, so
-- channel_usage_stats returns estimates separately from actuals.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.channel_pricing_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'COP',
  marketing_rate NUMERIC(12, 4) NOT NULL DEFAULT 0,
  utility_rate NUMERIC(12, 4) NOT NULL DEFAULT 0,
  authentication_rate NUMERIC(12, 4) NOT NULL DEFAULT 0,
  service_rate NUMERIC(12, 4) NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_pricing_rates_account
  ON public.channel_pricing_rates(account_id);

ALTER TABLE public.channel_pricing_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_pricing_rates_select ON public.channel_pricing_rates;
CREATE POLICY channel_pricing_rates_select ON public.channel_pricing_rates
  FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS channel_pricing_rates_insert ON public.channel_pricing_rates;
CREATE POLICY channel_pricing_rates_insert ON public.channel_pricing_rates
  FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS channel_pricing_rates_update ON public.channel_pricing_rates;
CREATE POLICY channel_pricing_rates_update ON public.channel_pricing_rates
  FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS channel_pricing_rates_delete ON public.channel_pricing_rates;
CREATE POLICY channel_pricing_rates_delete ON public.channel_pricing_rates
  FOR DELETE
  USING (is_account_member(account_id, 'admin'));

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
      r.id AS rate_id,
      r.currency,
      r.marketing_rate,
      r.utility_rate,
      r.authentication_rate,
      r.service_rate,
      CASE
        WHEN m.sender_type = 'customer' THEN 'inbound'
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
    LEFT JOIN public.channel_pricing_rates r
      ON r.account_id = c.account_id
      AND r.channel_id = c.channel_id
    WHERE (p_channel_id IS NULL OR c.channel_id = p_channel_id)
      AND m.created_at >= p_from
      AND m.created_at <= p_to
  ),
  totals AS (
    SELECT
      count(*) FILTER (WHERE sender_type <> 'customer') AS sent,
      count(*) FILTER (WHERE sender_type = 'customer') AS received,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status IN ('delivered', 'read')) AS delivered,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'read') AS read,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'failed') AS failed,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'marketing') AS marketing,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'utility') AS utility,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'authentication') AS authentication,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'service') AS service,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'unknown') AS unknown,
      count(*) FILTER (
        WHERE sender_type <> 'customer'
          AND rate_id IS NOT NULL
          AND billing_category IN ('marketing', 'utility', 'authentication', 'service')
      ) AS priced_messages,
      count(*) FILTER (
        WHERE sender_type <> 'customer'
          AND (
            rate_id IS NULL
            OR billing_category NOT IN ('marketing', 'utility', 'authentication', 'service')
          )
      ) AS unpriced_messages,
      COALESCE(sum(CASE WHEN billing_category = 'marketing' THEN marketing_rate ELSE 0 END), 0) AS marketing_cost,
      COALESCE(sum(CASE WHEN billing_category = 'utility' THEN utility_rate ELSE 0 END), 0) AS utility_cost,
      COALESCE(sum(CASE WHEN billing_category = 'authentication' THEN authentication_rate ELSE 0 END), 0) AS authentication_cost,
      COALESCE(sum(CASE WHEN billing_category = 'service' THEN service_rate ELSE 0 END), 0) AS service_cost,
      COALESCE(max(currency), 'COP') AS currency
    FROM scoped
  ),
  daily AS (
    SELECT
      date_trunc('day', created_at) AS day,
      count(*) FILTER (WHERE sender_type <> 'customer') AS sent,
      count(*) FILTER (WHERE sender_type = 'customer') AS received,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status IN ('delivered', 'read')) AS delivered,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'read') AS read,
      count(*) FILTER (WHERE sender_type <> 'customer' AND status = 'failed') AS failed,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'marketing') AS marketing,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'utility') AS utility,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'authentication') AS authentication,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'service') AS service,
      count(*) FILTER (WHERE sender_type <> 'customer' AND billing_category = 'unknown') AS unknown
    FROM scoped
    GROUP BY day
    ORDER BY day
  ),
  last_day AS (
    SELECT count(DISTINCT c.contact_id) AS unique_contacts_24h
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE (p_channel_id IS NULL OR c.channel_id = p_channel_id)
      AND m.created_at >= now() - interval '24 hours'
      AND m.sender_type <> 'customer'
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
    'categoryCosts', jsonb_build_object(
      'marketing', totals.marketing_cost,
      'utility', totals.utility_cost,
      'authentication', totals.authentication_cost,
      'service', totals.service_cost
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
      'available', totals.priced_messages > 0,
      'partial', totals.unpriced_messages > 0,
      'pricedMessages', totals.priced_messages,
      'unpricedMessages', totals.unpriced_messages,
      'currency', totals.currency,
      'estimatedTotalCop', totals.marketing_cost + totals.utility_cost + totals.authentication_cost + totals.service_cost,
      'actualTotalCop', NULL,
      'reason', CASE WHEN totals.priced_messages > 0 THEN NULL ELSE 'no_rate_card' END
    )
  )
  FROM totals, last_day;
$$;

ALTER FUNCTION public.channel_usage_stats(uuid, timestamptz, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.channel_usage_stats(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.channel_usage_stats(uuid, timestamptz, timestamptz) TO authenticated;
