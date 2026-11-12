-- ============================================================
-- 110_metricas.sql
--
-- Analytics data layer for the admin-only /metricas dashboard.
--
-- Everything here is computed from real rows already stored by the
-- CRM (conversations, messages, contacts, channels, profiles,
-- conversation_participants). No simulated or aggregate snapshot
-- tables are introduced.
--
-- Response semantics (shared by every metric below):
--   * customer message = messages.sender_type = 'customer'
--   * human reply      = sender_type = 'agent' AND not failed
--   * AI reply         = sender_type = 'bot' AND ai_generated = true
--   * automation reply = sender_type = 'bot' AND ai_generated = false
--   * failed outgoing messages are excluded from response times and
--     outgoing volume; they are reported separately.
--   * unanswered conversations are NULL samples, never 0 minutes.
--   * a reply must happen after the customer message it answers;
--     negative durations are impossible because the comparison is
--     explicitly ordered by (created_at, id).
--
-- "Resolved" and "closed" are the same state in this schema
-- (conversations.status only supports open/pending/closed). Both
-- names are returned so the UI can label the concept either way
-- without inventing a state the database does not have.
--
-- Access is admin/owner only, mirroring the /metricas page gate.
-- ============================================================

-- ------------------------------------------------------------
-- Per-account SLA configuration
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_sla_settings (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  first_response_minutes integer NOT NULL DEFAULT 3
    CHECK (first_response_minutes BETWEEN 1 AND 1440),
  between_messages_minutes integer NOT NULL DEFAULT 5
    CHECK (between_messages_minutes BETWEEN 1 AND 1440),
  pending_alert_minutes integer NOT NULL DEFAULT 5
    CHECK (pending_alert_minutes BETWEEN 1 AND 1440),
  critical_minutes integer NOT NULL DEFAULT 10
    CHECK (critical_minutes BETWEEN 1 AND 1440),
  use_business_hours boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/Bogota',
  workday_start time NOT NULL DEFAULT '08:00',
  workday_end time NOT NULL DEFAULT '18:00',
  workdays integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_sla_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_sla_settings_select ON public.account_sla_settings;
CREATE POLICY account_sla_settings_select ON public.account_sla_settings
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS account_sla_settings_insert ON public.account_sla_settings;
CREATE POLICY account_sla_settings_insert ON public.account_sla_settings
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS account_sla_settings_update ON public.account_sla_settings;
CREATE POLICY account_sla_settings_update ON public.account_sla_settings
  FOR UPDATE USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON public.account_sla_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.account_sla_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

REVOKE ALL ON public.account_sla_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.account_sla_settings TO authenticated;

-- No default rows are inserted here. The read-only RPCs fall back to the
-- same defaults when an account has no row, and PUT /api/metrics/sla
-- persists an explicit row only after an admin changes the settings.

-- ------------------------------------------------------------
-- Conversation event history
--
-- audit_logs is append-only but reserved for configuration-class
-- actions. Analytics needs conversation lifecycle events, so keep
-- them in their own table with a narrow, admin-read policy.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'conversation_created',
    'conversation_closed',
    'conversation_resolved',
    'conversation_reopened',
    'agent_assigned',
    'agent_unassigned',
    'transferred_to_human',
    'transferred_to_ai',
    'conversation_transferred',
    'message_received',
    'message_sent',
    'message_failed'
  )),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('customer', 'agent', 'ai', 'automation', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_events_account_created
  ON public.conversation_events(account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation_created
  ON public.conversation_events(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_events_account_type_created
  ON public.conversation_events(account_id, event_type, created_at);

ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_events_select ON public.conversation_events;
CREATE POLICY conversation_events_select ON public.conversation_events
  FOR SELECT USING (is_account_member(account_id, 'admin'));

-- No INSERT/UPDATE/DELETE policies: triggers write as the table
-- owner, same pattern as audit_logs.
REVOKE INSERT, UPDATE, DELETE ON public.conversation_events FROM authenticated, anon;
GRANT SELECT ON public.conversation_events TO authenticated;

CREATE OR REPLACE FUNCTION public.log_conversation_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account uuid;
  v_actor uuid := auth.uid();
  v_actor_type text;
  v_event_type text;
BEGIN
  IF TG_TABLE_NAME = 'conversations' THEN
    v_account := NEW.account_id;

    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.conversation_events
        (account_id, conversation_id, event_type, actor_user_id, actor_type, metadata, created_at)
      VALUES
        (v_account, NEW.id, 'conversation_created', v_actor,
         CASE WHEN v_actor IS NULL THEN 'system' ELSE 'agent' END,
         jsonb_build_object(
           'status', NEW.status,
           'channel_id', NEW.channel_id,
           'contact_id', NEW.contact_id,
           'assigned_agent_id', NEW.assigned_agent_id
         ),
         COALESCE(NEW.created_at, now()));
      RETURN NULL;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.conversation_events
        (account_id, conversation_id, event_type, actor_user_id, actor_type, metadata, created_at)
      VALUES
        (v_account, NEW.id,
         CASE
           WHEN NEW.status = 'closed' THEN 'conversation_closed'
           WHEN OLD.status = 'closed' AND NEW.status <> 'closed' THEN 'conversation_reopened'
           ELSE 'conversation_transferred'
         END,
         v_actor,
         CASE WHEN v_actor IS NULL THEN 'system' ELSE 'agent' END,
         jsonb_build_object('from', OLD.status, 'to', NEW.status),
         now());

      IF NEW.status = 'closed' THEN
        INSERT INTO public.conversation_events
          (account_id, conversation_id, event_type, actor_user_id, actor_type, metadata, created_at)
        VALUES
          (v_account, NEW.id, 'conversation_resolved', v_actor,
           CASE WHEN v_actor IS NULL THEN 'system' ELSE 'agent' END,
           jsonb_build_object('from', OLD.status, 'to', NEW.status), now());
      END IF;
    END IF;

    IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
      INSERT INTO public.conversation_events
        (account_id, conversation_id, event_type, actor_user_id, actor_type, metadata, created_at)
      VALUES
        (v_account, NEW.id,
         CASE WHEN NEW.assigned_agent_id IS NULL THEN 'agent_unassigned' ELSE 'agent_assigned' END,
         COALESCE(NEW.assigned_agent_id, OLD.assigned_agent_id),
         CASE WHEN v_actor IS NULL THEN 'system' ELSE 'agent' END,
         jsonb_build_object('from', OLD.assigned_agent_id, 'to', NEW.assigned_agent_id),
         now());
    END IF;

    IF NEW.ai_autoreply_disabled IS DISTINCT FROM OLD.ai_autoreply_disabled THEN
      INSERT INTO public.conversation_events
        (account_id, conversation_id, event_type, actor_user_id, actor_type, metadata, created_at)
      VALUES
        (v_account, NEW.id,
         CASE WHEN NEW.ai_autoreply_disabled
              THEN 'transferred_to_human' ELSE 'transferred_to_ai' END,
         v_actor,
         CASE WHEN v_actor IS NULL THEN 'system' ELSE 'agent' END,
         jsonb_build_object(
           'from', OLD.ai_autoreply_disabled,
           'to', NEW.ai_autoreply_disabled
         ),
         now());
    END IF;

    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'messages' THEN
    SELECT c.account_id INTO v_account
    FROM public.conversations c
    WHERE c.id = NEW.conversation_id;

    IF v_account IS NULL THEN
      RETURN NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
      IF NEW.sender_type = 'customer' THEN
        v_event_type := 'message_received';
        v_actor_type := 'customer';
      ELSIF NEW.sender_type = 'agent' THEN
        v_event_type := 'message_sent';
        v_actor_type := 'agent';
      ELSIF COALESCE(NEW.ai_generated, false) THEN
        v_event_type := 'message_sent';
        v_actor_type := 'ai';
      ELSE
        v_event_type := 'message_sent';
        v_actor_type := 'automation';
      END IF;

      INSERT INTO public.conversation_events
        (account_id, conversation_id, event_type, actor_user_id, actor_type, metadata, created_at)
      VALUES
        (v_account, NEW.conversation_id, v_event_type, NEW.sender_id, v_actor_type,
         jsonb_build_object(
           'message_id', NEW.id,
           'content_type', NEW.content_type,
           'status', NEW.status,
           'ai_generated', COALESCE(NEW.ai_generated, false)
         ),
         COALESCE(NEW.created_at, now()));
    ELSIF NEW.status = 'failed' AND OLD.status IS DISTINCT FROM 'failed' THEN
      INSERT INTO public.conversation_events
        (account_id, conversation_id, event_type, actor_user_id, actor_type, metadata, created_at)
      VALUES
        (v_account, NEW.conversation_id, 'message_failed', NEW.sender_id,
         CASE
           WHEN NEW.sender_type = 'agent' THEN 'agent'
           WHEN COALESCE(NEW.ai_generated, false) THEN 'ai'
           WHEN NEW.sender_type = 'bot' THEN 'automation'
           ELSE 'system'
         END,
         jsonb_build_object('message_id', NEW.id, 'reason', NEW.failure_reason),
         now());
    END IF;

    RETURN NULL;
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.log_conversation_event() OWNER TO postgres;

DROP TRIGGER IF EXISTS conversations_log_event ON public.conversations;
CREATE TRIGGER conversations_log_event
  AFTER INSERT OR UPDATE OF status, assigned_agent_id, ai_autoreply_disabled
  ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.log_conversation_event();

DROP TRIGGER IF EXISTS messages_log_event ON public.messages;
CREATE TRIGGER messages_log_event
  AFTER INSERT OR UPDATE OF status
  ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.log_conversation_event();

-- Idempotent backfill of lifecycle events for rows that predate the
-- trigger. Message-level events are not backfilled: replaying every
-- historical message into an event table would duplicate the messages
-- table without adding analytical value (the RPCs read messages
-- directly for historical metrics).
INSERT INTO public.conversation_events
  (account_id, conversation_id, event_type, actor_type, metadata, created_at)
SELECT c.account_id, c.id, 'conversation_created', 'system',
       jsonb_build_object('status', c.status, 'backfilled', true),
       c.created_at
FROM public.conversations c
WHERE NOT EXISTS (
  SELECT 1 FROM public.conversation_events e
  WHERE e.conversation_id = c.id
    AND e.event_type = 'conversation_created'
);

INSERT INTO public.conversation_events
  (account_id, conversation_id, event_type, actor_type, metadata, created_at)
SELECT c.account_id, c.id, 'conversation_resolved', 'system',
       jsonb_build_object('status', c.status, 'backfilled', true),
       c.closed_at
FROM public.conversations c
WHERE c.status = 'closed'
  AND c.closed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.conversation_events e
    WHERE e.conversation_id = c.id
      AND e.event_type = 'conversation_resolved'
  );

-- ------------------------------------------------------------
-- Shared range resolver
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.metricas_resolve_range(
  p_preset text,
  p_from date,
  p_to date,
  p_tz text
) RETURNS TABLE (
  range_start timestamptz,
  range_end timestamptz,
  previous_start timestamptz,
  previous_end timestamptz,
  range_days integer,
  timezone text,
  unit text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tz text := COALESCE(NULLIF(p_tz, ''), 'America/Bogota');
  v_today date;
  v_start date;
  v_end date;
  v_days integer;
BEGIN
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN others THEN
    v_tz := 'America/Bogota';
  END;

  v_today := (now() AT TIME ZONE v_tz)::date;

  IF p_preset = 'custom' THEN
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
      RAISE EXCEPTION 'p_from and p_to are required for a custom range'
        USING ERRCODE = '22023';
    END IF;
    v_start := p_from;
    v_end := p_to;
  ELSIF p_preset = 'today' THEN
    v_start := v_today;
    v_end := v_today;
  ELSIF p_preset = 'yesterday' THEN
    v_start := v_today - 1;
    v_end := v_today - 1;
  ELSIF p_preset = 'last7' THEN
    v_start := v_today - 6;
    v_end := v_today;
  ELSIF p_preset = 'last30' THEN
    v_start := v_today - 29;
    v_end := v_today;
  ELSIF p_preset = 'last90' THEN
    v_start := v_today - 89;
    v_end := v_today;
  ELSIF p_preset = 'this_month' THEN
    v_start := date_trunc('month', v_today)::date;
    v_end := v_today;
  ELSIF p_preset = 'last_month' THEN
    v_start := (date_trunc('month', v_today) - interval '1 month')::date;
    v_end := (date_trunc('month', v_today) - interval '1 day')::date;
  ELSE
    RAISE EXCEPTION 'unknown range preset: %', p_preset USING ERRCODE = '22023';
  END IF;

  v_days := GREATEST(1, (v_end - v_start) + 1);

  RETURN QUERY SELECT
    v_start::timestamp AT TIME ZONE v_tz,
    (v_end + 1)::timestamp AT TIME ZONE v_tz,
    (v_start - v_days)::timestamp AT TIME ZONE v_tz,
    v_start::timestamp AT TIME ZONE v_tz,
    v_days,
    v_tz,
    CASE WHEN v_days <= 2 THEN 'hour' ELSE 'day' END;
END;
$$;

ALTER FUNCTION public.metricas_resolve_range(text, date, date, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.metricas_resolve_range(text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_resolve_range(text, date, date, text) TO authenticated;

-- ------------------------------------------------------------
-- Overview RPC
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.account_metrics(integer, text, uuid);
DROP FUNCTION IF EXISTS public.account_metrics(text, date, date, text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.account_metrics(
  p_preset text DEFAULT 'last7',
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_tz text DEFAULT 'America/Bogota',
  p_channel_id uuid DEFAULT NULL,
  p_agent_id uuid DEFAULT NULL,
  p_attention text DEFAULT 'all'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account uuid;
  v_tz text := 'America/Bogota';
  v_range record;
  v_from timestamptz;
  v_to timestamptz;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_days integer;
  v_unit text;
  v_step interval;
  v_settings public.account_sla_settings%ROWTYPE;
  v_target integer;
  v_response_kind text;
BEGIN
  SELECT p.account_id INTO v_account
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_account IS NULL THEN
    RAISE EXCEPTION 'caller is not a member of an account' USING ERRCODE = '42501';
  END IF;

  IF NOT is_account_member(v_account, 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_attention NOT IN ('all', 'human', 'ai', 'automation') THEN
    RAISE EXCEPTION 'p_attention must be all, human, ai or automation'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_settings
  FROM public.account_sla_settings s
  WHERE s.account_id = v_account;

  IF v_settings.account_id IS NULL THEN
    v_settings.first_response_minutes := 3;
    v_settings.between_messages_minutes := 5;
    v_settings.pending_alert_minutes := 5;
    v_settings.critical_minutes := 10;
    v_settings.use_business_hours := false;
    v_settings.timezone := 'America/Bogota';
    v_settings.workday_start := '08:00';
    v_settings.workday_end := '18:00';
    v_settings.workdays := ARRAY[1, 2, 3, 4, 5];
  END IF;

  v_tz := COALESCE(NULLIF(p_tz, ''), v_settings.timezone, 'America/Bogota');
  SELECT * INTO v_range
  FROM public.metricas_resolve_range(p_preset, p_from, p_to, v_tz);

  v_from := v_range.range_start;
  v_to := v_range.range_end;
  v_prev_from := v_range.previous_start;
  v_prev_to := v_range.previous_end;
  v_days := v_range.range_days;
  v_tz := v_range.timezone;
  v_unit := v_range.unit;
  v_step := CASE WHEN v_unit = 'hour' THEN interval '1 hour' ELSE interval '1 day' END;
  v_target := COALESCE(v_settings.first_response_minutes, 3);
  v_response_kind := CASE WHEN p_attention IN ('human', 'ai', 'automation')
                          THEN p_attention ELSE 'human' END;

  RETURN (
    WITH scoped_conversations AS (
      SELECT c.id, c.status, c.created_at, c.closed_at, c.channel_id,
             c.contact_id, c.assigned_agent_id, c.last_inbound_at,
             c.last_reply_at, c.ai_paused_at
      FROM public.conversations c
      WHERE c.account_id = v_account
        AND (p_channel_id IS NULL OR c.channel_id = p_channel_id)
        AND (
          p_agent_id IS NULL
          OR c.assigned_agent_id = p_agent_id
          OR EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.conversation_id = c.id
              AND m.sender_type = 'agent'
              AND m.sender_id = p_agent_id
          )
          OR EXISTS (
            SELECT 1 FROM public.conversation_participants cp
            WHERE cp.conversation_id = c.id
              AND cp.user_id = p_agent_id
          )
        )
    ),
    scoped_messages AS (
      SELECT m.id, m.conversation_id, m.sender_id, m.sender_type,
             COALESCE(m.ai_generated, false) AS ai_generated, m.status,
             m.created_at, m.delivered_at, m.read_at, sc.channel_id,
             CASE
               WHEN m.sender_type = 'customer' THEN 'inbound'
               WHEN m.sender_type = 'agent' THEN 'human'
               WHEN m.sender_type = 'bot' AND COALESCE(m.ai_generated, false) THEN 'ai'
               ELSE 'automation'
             END AS kind
      FROM public.messages m
      JOIN scoped_conversations sc ON sc.id = m.conversation_id
      WHERE m.created_at >= v_prev_from
        AND m.created_at < v_to
    ),
    period_messages AS (
      SELECT * FROM scoped_messages
      WHERE created_at >= v_from AND created_at < v_to
    ),
    filtered_messages AS (
      SELECT * FROM period_messages
      WHERE p_attention = 'all'
         OR kind = 'inbound'
         OR kind = p_attention
    ),
    cohort_conversations AS (
      SELECT * FROM scoped_conversations
      WHERE created_at >= v_from AND created_at < v_to
    ),
    previous_cohort AS (
      SELECT * FROM scoped_conversations
      WHERE created_at >= v_prev_from AND created_at < v_prev_to
    ),
    cohort_messages AS (
      SELECT m.*
      FROM scoped_messages m
      JOIN cohort_conversations cc ON cc.id = m.conversation_id
      WHERE m.created_at < v_to
    ),
    previous_cohort_messages AS (
      SELECT m.*
      FROM scoped_messages m
      JOIN previous_cohort pc ON pc.id = m.conversation_id
      WHERE m.created_at < v_prev_to
    ),
    first_inbound AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id, m.created_at
      FROM cohort_messages m
      WHERE m.sender_type = 'customer'
      ORDER BY m.conversation_id, m.created_at, m.id
    ),
    first_response AS (
      SELECT fi.conversation_id,
             fi.created_at AS asked_at,
             r.created_at AS replied_at,
             r.sender_id AS agent_id,
             (extract(epoch FROM (r.created_at - fi.created_at)) / 60.0) AS minutes
      FROM first_inbound fi
      CROSS JOIN LATERAL (
        SELECT m.created_at, m.sender_id
        FROM cohort_messages m
        WHERE m.conversation_id = fi.conversation_id
          AND m.created_at >= fi.created_at
          AND m.status <> 'failed'
          AND (
            (v_response_kind = 'human'
              AND m.sender_type = 'agent'
              AND NOT m.ai_generated)
            OR (v_response_kind = 'ai'
              AND m.sender_type = 'bot'
              AND m.ai_generated)
            OR (v_response_kind = 'automation'
              AND m.sender_type = 'bot'
              AND NOT m.ai_generated)
          )
        ORDER BY m.created_at, m.id
        LIMIT 1
      ) r
    ),
    previous_first_inbound AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id, m.created_at
      FROM previous_cohort_messages m
      WHERE m.sender_type = 'customer'
      ORDER BY m.conversation_id, m.created_at, m.id
    ),
    previous_first_response AS (
      SELECT fi.conversation_id,
             fi.created_at AS asked_at,
             (extract(epoch FROM (r.created_at - fi.created_at)) / 60.0) AS minutes
      FROM previous_first_inbound fi
      CROSS JOIN LATERAL (
        SELECT m.created_at
        FROM previous_cohort_messages m
        WHERE m.conversation_id = fi.conversation_id
          AND m.created_at >= fi.created_at
          AND m.status <> 'failed'
          AND (
            (v_response_kind = 'human'
              AND m.sender_type = 'agent'
              AND NOT m.ai_generated)
            OR (v_response_kind = 'ai'
              AND m.sender_type = 'bot'
              AND m.ai_generated)
            OR (v_response_kind = 'automation'
              AND m.sender_type = 'bot'
              AND NOT m.ai_generated)
          )
        ORDER BY m.created_at, m.id
        LIMIT 1
      ) r
    ),
    response_stream AS (
      SELECT m.conversation_id, m.created_at, m.sender_id,
             (m.sender_type = 'customer') AS is_customer,
             lead(m.created_at) OVER (
               PARTITION BY m.conversation_id ORDER BY m.created_at, m.id
             ) AS next_at,
             lead(m.sender_type = 'customer') OVER (
               PARTITION BY m.conversation_id ORDER BY m.created_at, m.id
             ) AS next_customer
      FROM period_messages m
      WHERE m.sender_type = 'customer'
         OR (
           m.status <> 'failed'
           AND (
             (v_response_kind = 'human'
               AND m.sender_type = 'agent'
               AND NOT m.ai_generated)
             OR (v_response_kind = 'ai'
               AND m.sender_type = 'bot'
               AND m.ai_generated)
             OR (v_response_kind = 'automation'
               AND m.sender_type = 'bot'
               AND NOT m.ai_generated)
           )
         )
    ),
    response_turns AS (
      SELECT conversation_id, created_at AS asked_at,
             sender_id AS agent_id,
             (extract(epoch FROM (next_at - created_at)) / 60.0) AS minutes
      FROM response_stream
      WHERE is_customer
        AND next_customer IS FALSE
        AND next_at IS NOT NULL
    ),
    ai_stream AS (
      SELECT m.conversation_id, m.created_at,
             (m.sender_type = 'customer') AS is_customer,
             lead(m.created_at) OVER (
               PARTITION BY m.conversation_id ORDER BY m.created_at, m.id
             ) AS next_at,
             lead(m.sender_type = 'customer') OVER (
               PARTITION BY m.conversation_id ORDER BY m.created_at, m.id
             ) AS next_customer
      FROM period_messages m
      WHERE m.sender_type = 'customer'
         OR (m.kind = 'ai' AND m.status <> 'failed')
    ),
    ai_turns AS (
      SELECT conversation_id, created_at AS asked_at,
             (extract(epoch FROM (next_at - created_at)) / 60.0) AS minutes
      FROM ai_stream
      WHERE is_customer
        AND next_customer IS FALSE
        AND next_at IS NOT NULL
    ),
    resolved_conversations AS (
      SELECT c.id, c.channel_id, c.assigned_agent_id, c.contact_id, c.closed_at,
             (extract(epoch FROM (c.closed_at - c.created_at)) / 60.0) AS minutes
      FROM scoped_conversations c
      WHERE c.status = 'closed'
        AND c.closed_at >= v_from
        AND c.closed_at < v_to
    ),
    previous_resolved AS (
      SELECT c.id, c.channel_id, c.assigned_agent_id,
             (extract(epoch FROM (c.closed_at - c.created_at)) / 60.0) AS minutes
      FROM scoped_conversations c
      WHERE c.status = 'closed'
        AND c.closed_at >= v_prev_from
        AND c.closed_at < v_prev_to
    ),
    pending_scope AS (
      SELECT sc.id,
             (SELECT max(m.created_at)
              FROM public.messages m
              WHERE m.conversation_id = sc.id
                AND m.sender_type = 'customer') AS last_inbound,
             (SELECT max(m.created_at)
              FROM public.messages m
              WHERE m.conversation_id = sc.id
                AND m.sender_type = 'agent'
                AND m.status <> 'failed'
                AND NOT COALESCE(m.ai_generated, false)) AS last_human
      FROM scoped_conversations sc
      WHERE sc.status <> 'closed'
    ),
    pending AS (
      SELECT ps.id,
             (extract(epoch FROM (now() - ps.last_inbound)) / 60.0) AS waiting_minutes,
             ps.last_inbound, ps.last_human
      FROM pending_scope ps
      WHERE ps.last_inbound IS NOT NULL
        AND (ps.last_human IS NULL OR ps.last_human < ps.last_inbound)
    ),
    agent_message_stats AS (
      SELECT m.sender_id AS user_id,
             count(*) FILTER (WHERE m.kind = 'human' AND m.status <> 'failed') AS human_messages,
             count(*) FILTER (WHERE m.kind = 'ai' AND m.status <> 'failed') AS ai_messages,
             count(*) FILTER (WHERE m.kind = 'automation' AND m.status <> 'failed') AS automation_messages,
             count(DISTINCT m.conversation_id)
               FILTER (WHERE m.kind = 'human' AND m.status <> 'failed') AS handled
      FROM filtered_messages m
      WHERE m.sender_id IS NOT NULL
      GROUP BY m.sender_id
    ),
    agent_turn_stats AS (
      SELECT t.agent_id,
             count(*) AS replies,
             count(DISTINCT t.conversation_id) AS conversations,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY t.minutes) AS median_minutes,
             avg(t.minutes) AS avg_minutes,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY t.minutes) AS p90_minutes,
             count(*) FILTER (WHERE t.minutes <= v_target) AS within_target
      FROM response_turns t
      WHERE t.agent_id IS NOT NULL
      GROUP BY t.agent_id
    ),
    agent_first_stats AS (
      SELECT fr.agent_id,
             count(*) AS first_replies,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY fr.minutes) AS first_median,
             avg(fr.minutes) AS first_avg,
             count(*) FILTER (WHERE fr.minutes <= v_target) AS first_within
      FROM first_response fr
      WHERE fr.agent_id IS NOT NULL
      GROUP BY fr.agent_id
    ),
    agent_assigned AS (
      SELECT c.assigned_agent_id AS user_id, count(*) AS assigned
      FROM cohort_conversations c
      WHERE c.assigned_agent_id IS NOT NULL
      GROUP BY c.assigned_agent_id
    ),
    agent_resolved AS (
      SELECT c.assigned_agent_id AS user_id, count(*) AS resolved
      FROM resolved_conversations r
      JOIN scoped_conversations c ON c.id = r.id
      WHERE c.assigned_agent_id IS NOT NULL
      GROUP BY c.assigned_agent_id
    ),
    agent_open AS (
      SELECT c.assigned_agent_id AS user_id, count(*) AS open_count
      FROM scoped_conversations c
      WHERE c.status <> 'closed'
        AND c.assigned_agent_id IS NOT NULL
      GROUP BY c.assigned_agent_id
    ),
    channel_message_stats AS (
      SELECT m.channel_id,
             count(*) FILTER (WHERE m.kind = 'inbound' AND m.sender_type = 'customer') AS incoming,
             count(*) FILTER (WHERE m.sender_type <> 'customer' AND m.status <> 'failed') AS outgoing,
             count(*) FILTER (WHERE m.kind = 'human' AND m.status <> 'failed') AS human_messages,
             count(*) FILTER (WHERE m.kind = 'ai' AND m.status <> 'failed') AS ai_messages,
             count(*) FILTER (WHERE m.kind = 'automation' AND m.status <> 'failed') AS automation_messages,
             count(*) FILTER (WHERE m.sender_type <> 'customer' AND m.status = 'failed') AS failed
      FROM filtered_messages m
      GROUP BY m.channel_id
    ),
    channel_turn_stats AS (
      SELECT c.channel_id,
             count(*) AS replies,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY t.minutes) AS median_minutes,
             avg(t.minutes) AS avg_minutes,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY t.minutes) AS p90_minutes,
             count(*) FILTER (WHERE t.minutes <= v_target) AS within_target
      FROM response_turns t
      JOIN scoped_conversations c ON c.id = t.conversation_id
      GROUP BY c.channel_id
    ),
    channel_first_stats AS (
      SELECT c.channel_id,
             count(*) AS first_replies,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY fr.minutes) AS first_median,
             avg(fr.minutes) AS first_avg
      FROM first_response fr
      JOIN scoped_conversations c ON c.id = fr.conversation_id
      GROUP BY c.channel_id
    ),
    channel_conversation_stats AS (
      SELECT c.channel_id,
             count(*) FILTER (WHERE c.created_at >= v_from AND c.created_at < v_to) AS new_conversations,
             count(*) FILTER (WHERE c.status <> 'closed') AS open_conversations,
             count(*) FILTER (WHERE c.status = 'closed' AND c.closed_at >= v_from AND c.closed_at < v_to) AS resolved
      FROM scoped_conversations c
      GROUP BY c.channel_id
    ),
    buckets AS (
      SELECT b
      FROM generate_series(
        date_trunc(v_unit, (v_from AT TIME ZONE v_tz)),
        date_trunc(v_unit, ((v_to - interval '1 second') AT TIME ZONE v_tz)),
        v_step
      ) AS b
    ),
    series_message_counts AS (
      SELECT date_trunc(v_unit, m.created_at AT TIME ZONE v_tz) AS b,
             count(*) FILTER (WHERE m.sender_type = 'customer') AS incoming,
             count(*) FILTER (WHERE m.sender_type <> 'customer' AND m.status <> 'failed') AS outgoing,
             count(*) FILTER (WHERE m.kind = 'human' AND m.status <> 'failed') AS human_messages,
             count(*) FILTER (WHERE m.kind = 'ai' AND m.status <> 'failed') AS ai_messages,
             count(*) FILTER (WHERE m.kind = 'automation' AND m.status <> 'failed') AS automation_messages
      FROM filtered_messages m
      GROUP BY 1
    ),
    series_conversation_counts AS (
      SELECT date_trunc(v_unit, c.created_at AT TIME ZONE v_tz) AS b, count(*) AS n
      FROM cohort_conversations c
      GROUP BY 1
    ),
    series_resolved_counts AS (
      SELECT date_trunc(v_unit, c.closed_at AT TIME ZONE v_tz) AS b, count(*) AS n
      FROM resolved_conversations c
      GROUP BY 1
    ),
    series_turn_counts AS (
      SELECT date_trunc(v_unit, t.asked_at AT TIME ZONE v_tz) AS b,
             count(*) AS replies,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY t.minutes) AS median_minutes,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY t.minutes) AS p90_minutes
      FROM response_turns t
      GROUP BY 1
    ),
    hourly_message_counts AS (
      SELECT extract(hour FROM m.created_at AT TIME ZONE v_tz)::int AS hour,
             count(*) FILTER (WHERE m.sender_type = 'customer') AS incoming,
             count(*) FILTER (WHERE m.sender_type <> 'customer' AND m.status <> 'failed') AS outgoing
      FROM filtered_messages m
      GROUP BY 1
    ),
    hourly_turn_counts AS (
      SELECT extract(hour FROM t.asked_at AT TIME ZONE v_tz)::int AS hour,
             count(*) AS replies,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY t.minutes) AS median_minutes
      FROM response_turns t
      GROUP BY 1
    ),
    activity_matrix AS (
      SELECT extract(dow FROM m.created_at AT TIME ZONE v_tz)::int AS weekday,
             extract(hour FROM m.created_at AT TIME ZONE v_tz)::int AS hour,
             count(*) AS n
      FROM filtered_messages m
      WHERE m.sender_type = 'customer'
         OR (m.sender_type <> 'customer' AND m.status <> 'failed')
      GROUP BY 1, 2
    ),
    active_conversations AS (
      SELECT count(DISTINCT conversation_id) AS n FROM period_messages
    ),
    ai_conversations AS (
      SELECT count(DISTINCT m.conversation_id) AS n
      FROM period_messages m
      WHERE m.kind = 'ai'
    ),
    automation_conversations AS (
      SELECT count(DISTINCT m.conversation_id) AS n
      FROM period_messages m
      WHERE m.kind = 'automation'
    ),
    handoff_events AS (
      SELECT e.conversation_id
      FROM public.conversation_events e
      WHERE e.account_id = v_account
        AND e.event_type = 'transferred_to_human'
        AND e.created_at >= v_from
        AND e.created_at < v_to
      UNION
      SELECT c.id
      FROM scoped_conversations c
      WHERE c.ai_paused_at >= v_from
        AND c.ai_paused_at < v_to
    )
    SELECT jsonb_build_object(
      'generatedAt', now(),
      'timeZone', v_tz,
      'preset', p_preset,
      'from', v_from,
      'to', v_to,
      'previousFrom', v_prev_from,
      'previousTo', v_prev_to,
      'days', v_days,
      'unit', v_unit,
      'channelId', p_channel_id,
      'agentId', p_agent_id,
      'attention', p_attention,
      'replyTargetMinutes', v_target,
      'sla', jsonb_build_object(
        'firstResponseMinutes', v_settings.first_response_minutes,
        'betweenMessagesMinutes', v_settings.between_messages_minutes,
        'pendingAlertMinutes', v_settings.pending_alert_minutes,
        'criticalMinutes', v_settings.critical_minutes,
        'useBusinessHours', v_settings.use_business_hours,
        'timezone', v_settings.timezone,
        'workdayStart', v_settings.workday_start,
        'workdayEnd', v_settings.workday_end,
        'workdays', to_jsonb(v_settings.workdays)
      ),
      'filters', jsonb_build_object(
        'channelId', p_channel_id,
        'agentId', p_agent_id,
        'attention', p_attention
      ),
      'summary', (jsonb_build_object(
        'turns', (SELECT count(*) FROM response_turns),
        'turnsPrevious', (
          SELECT count(*)
          FROM scoped_messages m
          JOIN previous_cohort pc ON pc.id = m.conversation_id
          WHERE m.created_at >= v_prev_from AND m.created_at < v_prev_to
            AND m.sender_type = 'customer'
        ),
        'medianHuman', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FROM response_turns
        ),
        'medianHumanPrevious', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
          FROM previous_first_response
        ),
        'avgHuman', (SELECT avg(minutes) FROM response_turns),
        'avgHumanPrevious', (SELECT avg(minutes) FROM previous_first_response),
        'p90Human', (
          SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes) FROM response_turns
        ),
        'p90HumanPrevious', (
          SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes)
          FROM previous_first_response
        ),
        'medianFirst', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FROM first_response
        ),
        'medianFirstPrevious', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
          FROM previous_first_response
        ),
        'avgFirst', (SELECT avg(minutes) FROM first_response),
        'avgFirstPrevious', (SELECT avg(minutes) FROM previous_first_response),
        'p90First', (
          SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes) FROM first_response
        ),
        'p90FirstPrevious', (
          SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes)
          FROM previous_first_response
        ),
        'firstResponseCount', (SELECT count(*) FROM first_response),
        'withinTarget', (
          SELECT count(*) FROM first_response WHERE minutes <= v_target
        ),
        'slaRate', (
          SELECT CASE WHEN count(*) = 0 THEN NULL
                      ELSE count(*) FILTER (WHERE minutes <= v_target)::numeric / count(*)
                 END
          FROM first_response
        ),
        'slaRatePrevious', (
          SELECT CASE WHEN count(*) = 0 THEN NULL
                      ELSE count(*) FILTER (WHERE minutes <= v_target)::numeric / count(*)
                 END
          FROM previous_first_response
        ),
        'medianAi', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FROM ai_turns
        ),
        'avgAi', (SELECT avg(minutes) FROM ai_turns),
        'aiTurns', (SELECT count(*) FROM ai_turns),
        'medianResolution', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
          FROM resolved_conversations
        ),
        'avgResolution', (SELECT avg(minutes) FROM resolved_conversations),
        'medianResolutionPrevious', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
          FROM previous_resolved
        )
      ) || jsonb_build_object(
        'newConversations', (SELECT count(*) FROM cohort_conversations),
        'newConversationsPrevious', (SELECT count(*) FROM previous_cohort),
        'newContacts', (
          SELECT count(DISTINCT c.contact_id)
          FROM cohort_conversations c
          JOIN public.contacts ct ON ct.id = c.contact_id
          WHERE ct.created_at >= v_from AND ct.created_at < v_to
        ),
        'newContactsPrevious', (
          SELECT count(DISTINCT c.contact_id)
          FROM previous_cohort c
          JOIN public.contacts ct ON ct.id = c.contact_id
          WHERE ct.created_at >= v_prev_from AND ct.created_at < v_prev_to
        ),
        'resolved', (SELECT count(*) FROM resolved_conversations),
        'closed', (SELECT count(*) FROM resolved_conversations),
        'resolvedPrevious', (SELECT count(*) FROM previous_resolved),
        'openConversations', (
          SELECT count(*) FROM scoped_conversations WHERE status <> 'closed'
        ),
        'open', (
          SELECT count(*) FROM scoped_conversations WHERE status <> 'closed'
        ),
        'assigned', (
          SELECT count(*) FROM cohort_conversations WHERE assigned_agent_id IS NOT NULL
        ),
        'unassigned', (
          SELECT count(*) FROM scoped_conversations
          WHERE status <> 'closed' AND assigned_agent_id IS NULL
        ),
        'handled', (
          SELECT count(DISTINCT conversation_id)
          FROM filtered_messages
          WHERE kind = 'human' AND status <> 'failed'
        ),
        'unansweredConversations', (SELECT count(*) FROM pending),
        'unanswered', (SELECT count(*) FROM pending),
        'pendingWarning', (
          SELECT count(*) FROM pending
          WHERE waiting_minutes >= v_settings.pending_alert_minutes
            AND waiting_minutes < v_settings.critical_minutes
        ),
        'pendingCritical', (
          SELECT count(*) FROM pending WHERE waiting_minutes >= v_settings.critical_minutes
        ),
        'oldestPendingMinutes', (SELECT max(waiting_minutes) FROM pending),
        'inbound', (
          SELECT count(*) FROM filtered_messages WHERE sender_type = 'customer'
        ),
        'outbound', (
          SELECT count(*) FROM filtered_messages
          WHERE sender_type <> 'customer' AND status <> 'failed'
        ),
        'outboundHuman', (
          SELECT count(*) FROM filtered_messages
          WHERE kind = 'human' AND status <> 'failed'
        ),
        'outboundAi', (
          SELECT count(*) FROM filtered_messages
          WHERE kind = 'ai' AND status <> 'failed'
        ),
        'outboundAutomation', (
          SELECT count(*) FROM filtered_messages
          WHERE kind = 'automation' AND status <> 'failed'
        ),
        'failed', (
          SELECT count(*) FROM period_messages
          WHERE sender_type <> 'customer' AND status = 'failed'
        ),
        'delivered', (
          SELECT count(*) FROM filtered_messages
          WHERE sender_type <> 'customer'
            AND status <> 'failed'
            AND (status IN ('delivered', 'read') OR delivered_at IS NOT NULL)
        ),
        'read', (
          SELECT count(*) FROM filtered_messages
          WHERE sender_type <> 'customer'
            AND status <> 'failed'
            AND (status = 'read' OR read_at IS NOT NULL)
        ),
        'aiMessages', (
          SELECT count(*) FROM period_messages
          WHERE kind = 'ai' AND status <> 'failed'
        ),
        'aiConversations', (SELECT n FROM ai_conversations),
        'automationMessages', (
          SELECT count(*) FROM period_messages
          WHERE kind = 'automation' AND status <> 'failed'
        ),
        'automationConversations', (SELECT n FROM automation_conversations),
        'aiParticipationRate', (
          SELECT CASE WHEN ac.n = 0 THEN NULL
                      ELSE (SELECT n FROM ai_conversations)::numeric / ac.n
                 END
          FROM active_conversations ac
        ),
        'humanHandoffs', (SELECT count(DISTINCT conversation_id) FROM handoff_events),
        'activeAgents', (
          SELECT count(DISTINCT sender_id)
          FROM filtered_messages
          WHERE kind = 'human' AND status <> 'failed' AND sender_id IS NOT NULL
        ),
        'responseAverage', (SELECT avg(minutes) FROM response_turns),
        'responseMedian', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FROM response_turns
        ),
        'responseP90', (
          SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes) FROM response_turns
        ),
        'responseCount', (SELECT count(*) FROM response_turns)
      )),
      'series', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          't', to_char(bk.b, 'YYYY-MM-DD"T"HH24:MI'),
          'incoming', COALESCE(sm.incoming, 0),
          'outgoing', COALESCE(sm.outgoing, 0),
          'human', COALESCE(sm.human_messages, 0),
          'ai', COALESCE(sm.ai_messages, 0),
          'automation', COALESCE(sm.automation_messages, 0),
          'newConversations', COALESCE(sc.n, 0),
          'resolved', COALESCE(sr.n, 0),
          'replies', COALESCE(st.replies, 0),
          'medianHuman', st.median_minutes,
          'p90Human', st.p90_minutes
        ) ORDER BY bk.b)
        FROM buckets bk
        LEFT JOIN series_message_counts sm ON sm.b = bk.b
        LEFT JOIN series_conversation_counts sc ON sc.b = bk.b
        LEFT JOIN series_resolved_counts sr ON sr.b = bk.b
        LEFT JOIN series_turn_counts st ON st.b = bk.b
      ), '[]'::jsonb),
      'hourly', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'hour', hr.hour,
          'incoming', COALESCE(hm.incoming, 0),
          'outgoing', COALESCE(hm.outgoing, 0),
          'replies', COALESCE(ht.replies, 0),
          'medianHuman', ht.median_minutes
        ) ORDER BY hr.hour)
        FROM generate_series(0, 23) AS hr(hour)
        LEFT JOIN hourly_message_counts hm ON hm.hour = hr.hour
        LEFT JOIN hourly_turn_counts ht ON ht.hour = hr.hour
      ), '[]'::jsonb),
      'agents', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'userId', p.user_id,
          'name', p.full_name,
          'avatarUrl', p.avatar_url,
          'role', p.account_role,
          'assigned', COALESCE(aa.assigned, 0),
          'handled', COALESCE(ams.handled, 0),
          'resolved', COALESCE(ar.resolved, 0),
          'open', COALESCE(ao.open_count, 0),
          'replies', COALESCE(ats.replies, 0),
          'conversations', COALESCE(ats.conversations, 0),
          'medianMinutes', ats.median_minutes,
          'avgMinutes', ats.avg_minutes,
          'p90Minutes', ats.p90_minutes,
          'withinTarget', COALESCE(ats.within_target, 0),
          'firstReplies', COALESCE(afs.first_replies, 0),
          'firstMedianMinutes', afs.first_median,
          'firstAvgMinutes', afs.first_avg,
          'firstWithinTarget', COALESCE(afs.first_within, 0),
          'humanMessages', COALESCE(ams.human_messages, 0),
          'aiMessages', COALESCE(ams.ai_messages, 0),
          'automationMessages', COALESCE(ams.automation_messages, 0)
        ) ORDER BY p.full_name NULLS LAST)
        FROM public.profiles p
        LEFT JOIN agent_message_stats ams ON ams.user_id = p.user_id
        LEFT JOIN agent_turn_stats ats ON ats.agent_id = p.user_id
        LEFT JOIN agent_first_stats afs ON afs.agent_id = p.user_id
        LEFT JOIN agent_assigned aa ON aa.user_id = p.user_id
        LEFT JOIN agent_resolved ar ON ar.user_id = p.user_id
        LEFT JOIN agent_open ao ON ao.user_id = p.user_id
        WHERE p.account_id = v_account
          AND (p_agent_id IS NULL OR p.user_id = p_agent_id)
      ), '[]'::jsonb),
      'channels', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'channelId', ch.id,
          'name', ch.name,
          'color', ch.color,
          'newConversations', COALESCE(ccs.new_conversations, 0),
          'openConversations', COALESCE(ccs.open_conversations, 0),
          'resolved', COALESCE(ccs.resolved, 0),
          'incoming', COALESCE(cms.incoming, 0),
          'outgoing', COALESCE(cms.outgoing, 0),
          'human', COALESCE(cms.human_messages, 0),
          'ai', COALESCE(cms.ai_messages, 0),
          'automation', COALESCE(cms.automation_messages, 0),
          'failed', COALESCE(cms.failed, 0),
          'replies', COALESCE(cts.replies, 0),
          'medianMinutes', cts.median_minutes,
          'avgMinutes', cts.avg_minutes,
          'p90Minutes', cts.p90_minutes,
          'withinTarget', COALESCE(cts.within_target, 0),
          'firstReplies', COALESCE(cfs.first_replies, 0),
          'firstMedianMinutes', cfs.first_median,
          'firstAvgMinutes', cfs.first_avg
        ) ORDER BY ch.name)
        FROM public.channels ch
        LEFT JOIN channel_message_stats cms ON cms.channel_id = ch.id
        LEFT JOIN channel_turn_stats cts ON cts.channel_id = ch.id
        LEFT JOIN channel_first_stats cfs ON cfs.channel_id = ch.id
        LEFT JOIN channel_conversation_stats ccs ON ccs.channel_id = ch.id
        WHERE ch.account_id = v_account
          AND (p_channel_id IS NULL OR ch.id = p_channel_id)
      ), '[]'::jsonb),
      'ai', jsonb_build_object(
        'messages', (
          SELECT count(*) FROM period_messages
          WHERE kind = 'ai' AND status <> 'failed'
        ),
        'conversations', (SELECT n FROM ai_conversations),
        'participationRate', (
          SELECT CASE WHEN ac.n = 0 THEN NULL
                      ELSE (SELECT n FROM ai_conversations)::numeric / ac.n
                 END
          FROM active_conversations ac
        ),
        'turns', (SELECT count(*) FROM ai_turns),
        'medianMinutes', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FROM ai_turns
        ),
        'avgMinutes', (SELECT avg(minutes) FROM ai_turns),
        'automationMessages', (
          SELECT count(*) FROM period_messages
          WHERE kind = 'automation' AND status <> 'failed'
        ),
        'automationConversations', (SELECT n FROM automation_conversations),
        'humanHandoffs', (SELECT count(DISTINCT conversation_id) FROM handoff_events)
      ),
      'activity', jsonb_build_object(
        'matrix', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'weekday', wd.weekday,
            'hour', hr.hour,
            'count', COALESCE(am.n, 0)
          ) ORDER BY wd.weekday, hr.hour)
          FROM generate_series(0, 6) AS wd(weekday)
          CROSS JOIN generate_series(0, 23) AS hr(hour)
          LEFT JOIN activity_matrix am
            ON am.weekday = wd.weekday AND am.hour = hr.hour
        ), '[]'::jsonb),
        'peakHour', (
          SELECT hour FROM activity_matrix
          ORDER BY n DESC, hour ASC LIMIT 1
        ),
        'peakWeekday', (
          SELECT weekday FROM activity_matrix
          ORDER BY n DESC, weekday ASC LIMIT 1
        )
      ),
      'pending', jsonb_build_object(
        'total', (SELECT count(*) FROM pending),
        'warning', (
          SELECT count(*) FROM pending
          WHERE waiting_minutes >= v_settings.pending_alert_minutes
            AND waiting_minutes < v_settings.critical_minutes
        ),
        'critical', (
          SELECT count(*) FROM pending WHERE waiting_minutes >= v_settings.critical_minutes
        ),
        'oldestMinutes', (SELECT max(waiting_minutes) FROM pending)
      )
    )
  );
END;
$$;

ALTER FUNCTION public.account_metrics(text, date, date, text, uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_metrics(text, date, date, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_metrics(text, date, date, text, uuid, uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- Conversation detail RPC for the /metricas table and export
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.metricas_conversations(text, date, date, text, uuid, uuid, text, text, text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.metricas_conversations(
  p_preset text DEFAULT 'last7',
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_tz text DEFAULT 'America/Bogota',
  p_channel_id uuid DEFAULT NULL,
  p_agent_id uuid DEFAULT NULL,
  p_attention text DEFAULT 'all',
  p_status text DEFAULT 'all',
  p_sla text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'last_activity',
  p_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account uuid;
  v_tz text := 'America/Bogota';
  v_range record;
  v_from timestamptz;
  v_to timestamptz;
  v_settings public.account_sla_settings%ROWTYPE;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 5000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT p.account_id INTO v_account
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_account IS NULL THEN
    RAISE EXCEPTION 'caller is not a member of an account' USING ERRCODE = '42501';
  END IF;

  IF NOT is_account_member(v_account, 'admin') THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_attention NOT IN ('all', 'human', 'ai', 'automation') THEN
    RAISE EXCEPTION 'p_attention must be all, human, ai or automation'
      USING ERRCODE = '22023';
  END IF;

  IF p_status NOT IN ('all', 'open', 'pending', 'closed') THEN
    RAISE EXCEPTION 'p_status must be all, open, pending or closed'
      USING ERRCODE = '22023';
  END IF;

  IF p_sla NOT IN ('all', 'met', 'breached', 'unanswered', 'pending', 'critical') THEN
    RAISE EXCEPTION 'p_sla must be all, met, breached, unanswered, pending or critical'
      USING ERRCODE = '22023';
  END IF;

  IF p_sort NOT IN ('last_activity', 'created', 'first_response', 'pending', 'contact') THEN
    RAISE EXCEPTION 'p_sort must be last_activity, created, first_response, pending or contact'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_settings
  FROM public.account_sla_settings s
  WHERE s.account_id = v_account;

  IF v_settings.account_id IS NULL THEN
    v_settings.first_response_minutes := 3;
    v_settings.between_messages_minutes := 5;
    v_settings.pending_alert_minutes := 5;
    v_settings.critical_minutes := 10;
    v_settings.use_business_hours := false;
    v_settings.timezone := 'America/Bogota';
    v_settings.workday_start := '08:00';
    v_settings.workday_end := '18:00';
    v_settings.workdays := ARRAY[1, 2, 3, 4, 5];
  END IF;

  v_tz := COALESCE(NULLIF(p_tz, ''), v_settings.timezone, 'America/Bogota');
  SELECT * INTO v_range
  FROM public.metricas_resolve_range(p_preset, p_from, p_to, v_tz);

  v_from := v_range.range_start;
  v_to := v_range.range_end;
  v_tz := v_range.timezone;

  RETURN (
    WITH scoped_conversations AS (
      SELECT c.*
      FROM public.conversations c
      WHERE c.account_id = v_account
        AND (p_channel_id IS NULL OR c.channel_id = p_channel_id)
        AND (
          p_agent_id IS NULL
          OR c.assigned_agent_id = p_agent_id
          OR EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.conversation_id = c.id
              AND m.sender_type = 'agent'
              AND m.sender_id = p_agent_id
          )
          OR EXISTS (
            SELECT 1 FROM public.conversation_participants cp
            WHERE cp.conversation_id = c.id
              AND cp.user_id = p_agent_id
          )
        )
    ),
    period_messages AS (
      SELECT m.id, m.conversation_id, m.sender_id, m.sender_type,
             COALESCE(m.ai_generated, false) AS ai_generated, m.status, m.created_at,
             CASE
               WHEN m.sender_type = 'customer' THEN 'inbound'
               WHEN m.sender_type = 'agent' THEN 'human'
               WHEN m.sender_type = 'bot' AND COALESCE(m.ai_generated, false) THEN 'ai'
               ELSE 'automation'
             END AS kind
      FROM public.messages m
      JOIN scoped_conversations sc ON sc.id = m.conversation_id
      WHERE m.created_at >= v_from AND m.created_at < v_to
    ),
    active_conversations AS (
      SELECT DISTINCT sc.*
      FROM scoped_conversations sc
      WHERE (
        p_attention = 'all'
        AND (
          EXISTS (
            SELECT 1 FROM period_messages m
            WHERE m.conversation_id = sc.id
          )
          OR (sc.created_at >= v_from AND sc.created_at < v_to)
        )
      )
      OR (
        p_attention <> 'all'
        AND EXISTS (
          SELECT 1 FROM period_messages m
          WHERE m.conversation_id = sc.id
            AND m.kind = p_attention
        )
      )
    ),
    conversation_stats AS (
      SELECT
        sc.id,
        sc.created_at,
        sc.closed_at,
        sc.status,
        sc.channel_id,
        sc.assigned_agent_id,
        sc.contact_id,
        sc.last_message_at,
        (SELECT min(m.created_at) FROM public.messages m
         WHERE m.conversation_id = sc.id AND m.sender_type = 'customer') AS first_inbound_at,
        (SELECT min(m.created_at) FROM public.messages m
         WHERE m.conversation_id = sc.id
           AND m.sender_type = 'agent'
           AND m.status <> 'failed'
           AND NOT COALESCE(m.ai_generated, false)) AS first_human_reply_at,
        (SELECT max(m.created_at) FROM public.messages m
         WHERE m.conversation_id = sc.id AND m.sender_type = 'customer') AS last_inbound,
        (SELECT max(m.created_at) FROM public.messages m
         WHERE m.conversation_id = sc.id
           AND m.sender_type = 'agent'
           AND m.status <> 'failed'
           AND NOT COALESCE(m.ai_generated, false)) AS last_human_reply_at,
        count(*) FILTER (WHERE pm.sender_type = 'customer') AS inbound,
        count(*) FILTER (WHERE pm.kind = 'human' AND pm.status <> 'failed') AS human_messages,
        count(*) FILTER (WHERE pm.kind = 'ai' AND pm.status <> 'failed') AS ai_messages,
        count(*) FILTER (WHERE pm.kind = 'automation' AND pm.status <> 'failed') AS automation_messages,
        count(*) FILTER (WHERE pm.sender_type <> 'customer' AND pm.status = 'failed') AS failed_messages,
        bool_or(pm.kind = 'human' AND pm.status <> 'failed') AS has_human,
        bool_or(pm.kind = 'ai' AND pm.status <> 'failed') AS has_ai,
        bool_or(pm.kind = 'automation' AND pm.status <> 'failed') AS has_automation
      FROM active_conversations sc
      LEFT JOIN period_messages pm ON pm.conversation_id = sc.id
      GROUP BY sc.id, sc.created_at, sc.closed_at, sc.status, sc.channel_id,
               sc.assigned_agent_id, sc.contact_id, sc.last_message_at
    ),
    enriched AS (
      SELECT
        cs.*,
        CASE
          WHEN cs.first_inbound_at IS NULL THEN NULL
          WHEN cs.first_human_reply_at IS NULL THEN NULL
          WHEN cs.first_human_reply_at < cs.first_inbound_at THEN NULL
          ELSE extract(epoch FROM (cs.first_human_reply_at - cs.first_inbound_at)) / 60.0
        END AS first_response_minutes,
        CASE
          WHEN cs.status = 'closed' THEN NULL
          WHEN cs.last_inbound IS NULL THEN NULL
          WHEN cs.last_human_reply_at IS NOT NULL
               AND cs.last_human_reply_at >= cs.last_inbound THEN NULL
          ELSE extract(epoch FROM (now() - cs.last_inbound)) / 60.0
        END AS pending_minutes,
        CASE
          WHEN cs.has_human THEN 'human'
          WHEN cs.has_ai THEN 'ai'
          WHEN cs.has_automation THEN 'automation'
          ELSE 'inbound'
        END AS attention_kind
      FROM conversation_stats cs
    ),
    filtered AS (
      SELECT
        e.*,
        c.name AS contact_name,
        c.phone AS contact_phone,
        ch.name AS channel_name,
        ch.color AS channel_color,
        p.full_name AS agent_name,
        CASE
          WHEN e.status = 'closed' THEN 'closed'
          ELSE e.status
        END AS display_status,
        CASE
          WHEN e.status <> 'closed' AND e.pending_minutes IS NOT NULL
               AND e.pending_minutes >= v_settings.critical_minutes THEN 'critical'
          WHEN e.status <> 'closed' AND e.pending_minutes IS NOT NULL
               AND e.pending_minutes >= v_settings.pending_alert_minutes THEN 'pending'
          WHEN e.first_response_minutes IS NULL AND e.first_inbound_at IS NOT NULL THEN 'unanswered'
          WHEN e.first_response_minutes IS NOT NULL
               AND e.first_response_minutes > v_settings.first_response_minutes THEN 'breached'
          WHEN e.first_response_minutes IS NOT NULL THEN 'met'
          ELSE 'no_inbound'
        END AS sla_state
      FROM enriched e
      LEFT JOIN public.contacts c ON c.id = e.contact_id
      LEFT JOIN public.channels ch ON ch.id = e.channel_id
      LEFT JOIN public.profiles p ON p.user_id = e.assigned_agent_id
    ),
    visible AS (
      SELECT *
      FROM filtered f
      WHERE (p_status = 'all' OR f.display_status = p_status)
        AND (
          p_sla = 'all'
          OR (p_sla = 'met' AND f.sla_state = 'met')
          OR (p_sla = 'breached' AND f.sla_state = 'breached')
          OR (p_sla = 'unanswered' AND f.sla_state = 'unanswered')
          OR (p_sla = 'pending' AND f.sla_state = 'pending')
          OR (p_sla = 'critical' AND f.sla_state = 'critical')
        )
        AND (
          p_search IS NULL
          OR p_search = ''
          OR COALESCE(f.contact_name, '') ILIKE '%' || p_search || '%'
          OR COALESCE(f.contact_phone, '') ILIKE '%' || p_search || '%'
        )
    ),
    page AS (
      SELECT *
      FROM visible
      ORDER BY
        CASE WHEN p_sort = 'last_activity' AND p_dir = 'asc' THEN last_message_at END ASC,
        CASE WHEN p_sort = 'last_activity' AND p_dir = 'desc' THEN last_message_at END DESC,
        CASE WHEN p_sort = 'created' AND p_dir = 'asc' THEN created_at END ASC,
        CASE WHEN p_sort = 'created' AND p_dir = 'desc' THEN created_at END DESC,
        CASE WHEN p_sort = 'first_response' AND p_dir = 'asc' THEN first_response_minutes END ASC NULLS LAST,
        CASE WHEN p_sort = 'first_response' AND p_dir = 'desc' THEN first_response_minutes END DESC NULLS LAST,
        CASE WHEN p_sort = 'pending' AND p_dir = 'asc' THEN pending_minutes END ASC NULLS LAST,
        CASE WHEN p_sort = 'pending' AND p_dir = 'desc' THEN pending_minutes END DESC NULLS LAST,
        CASE WHEN p_sort = 'contact' AND p_dir = 'asc' THEN contact_name END ASC NULLS LAST,
        CASE WHEN p_sort = 'contact' AND p_dir = 'desc' THEN contact_name END DESC NULLS LAST,
        created_at DESC
      LIMIT v_limit
      OFFSET v_offset
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM visible),
      'limit', v_limit,
      'offset', v_offset,
      'timeZone', v_tz,
      'from', v_from,
      'to', v_to,
      'rows', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', page.id,
          'contactId', page.contact_id,
          'contactName', page.contact_name,
          'contactPhone', page.contact_phone,
          'channelId', page.channel_id,
          'channelName', page.channel_name,
          'channelColor', page.channel_color,
          'assignedAgentId', page.assigned_agent_id,
          'assignedAgentName', page.agent_name,
          'status', page.display_status,
          'attention', page.attention_kind,
          'createdAt', page.created_at,
          'closedAt', page.closed_at,
          'lastMessageAt', page.last_message_at,
          'firstInboundAt', page.first_inbound_at,
          'firstHumanReplyAt', page.first_human_reply_at,
          'firstResponseMinutes', page.first_response_minutes,
          'pendingMinutes', page.pending_minutes,
          'slaState', page.sla_state,
          'inbound', page.inbound,
          'humanMessages', page.human_messages,
          'aiMessages', page.ai_messages,
          'automationMessages', page.automation_messages,
          'failedMessages', page.failed_messages
        ) ORDER BY
          CASE WHEN p_sort = 'last_activity' AND p_dir = 'asc' THEN page.last_message_at END ASC,
          CASE WHEN p_sort = 'last_activity' AND p_dir = 'desc' THEN page.last_message_at END DESC,
          CASE WHEN p_sort = 'created' AND p_dir = 'asc' THEN page.created_at END ASC,
          CASE WHEN p_sort = 'created' AND p_dir = 'desc' THEN page.created_at END DESC,
          CASE WHEN p_sort = 'first_response' AND p_dir = 'asc' THEN page.first_response_minutes END ASC NULLS LAST,
          CASE WHEN p_sort = 'first_response' AND p_dir = 'desc' THEN page.first_response_minutes END DESC NULLS LAST,
          CASE WHEN p_sort = 'pending' AND p_dir = 'asc' THEN page.pending_minutes END ASC NULLS LAST,
          CASE WHEN p_sort = 'pending' AND p_dir = 'desc' THEN page.pending_minutes END DESC NULLS LAST,
          CASE WHEN p_sort = 'contact' AND p_dir = 'asc' THEN page.contact_name END ASC NULLS LAST,
          CASE WHEN p_sort = 'contact' AND p_dir = 'desc' THEN page.contact_name END DESC NULLS LAST,
          page.created_at DESC
        )
        FROM page
      ), '[]'::jsonb)
    )
  );
END;
$$;

ALTER FUNCTION public.metricas_conversations(text, date, date, text, uuid, uuid, text, text, text, text, text, text, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.metricas_conversations(text, date, date, text, uuid, uuid, text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metricas_conversations(text, date, date, text, uuid, uuid, text, text, text, text, text, text, integer, integer) TO authenticated;
