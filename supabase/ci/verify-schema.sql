-- Post-migration assertions for the CI job in
-- `.github/workflows/migrations.yml`.
--
-- `supabase db reset` already fails on any statement Postgres rejects,
-- so this is not about syntax. It's about the quieter failure: a
-- migration that applies cleanly and does nothing. Every DDL statement
-- in this repo is guarded with IF NOT EXISTS / ON CONFLICT so the files
-- can be re-run safely, and that same guard turns a typo'd object name
-- into a silent no-op with a green checkmark.
--
-- Keep this thin. It is a smoke test for "did the migrations actually
-- build the schema", not a spec of it — asserting every column here
-- would just be the migrations restated in a second place, drifting.
DO $$
BEGIN
  -- The core tables, from 001.
  IF to_regclass('public.messages') IS NULL THEN
    RAISE EXCEPTION 'public.messages is missing — migrations did not apply';
  END IF;
  IF to_regclass('public.whatsapp_config') IS NULL THEN
    RAISE EXCEPTION 'public.whatsapp_config is missing — migrations did not apply';
  END IF;

  -- Supabase provides the storage schema; migrations 016/020/023 write
  -- to it. If it is absent the bucket migrations silently accomplish
  -- nothing, which is precisely the case a plain "no errors" run hides.
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION
      'storage.buckets is missing — the storage schema was not available when the bucket migrations ran';
  END IF;

  -- Buckets are UPSERTed, so their absence means the INSERT never ran.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-media') THEN
    RAISE EXCEPTION 'the chat-media bucket row was not created (migration 023)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'flow-media') THEN
    RAISE EXCEPTION 'the flow-media bucket row was not created (migration 016)';
  END IF;

  -- Account scoping (017) is load-bearing for every RLS policy.
  IF to_regclass('public.accounts') IS NULL THEN
    RAISE EXCEPTION 'public.accounts is missing — migration 017 did not apply';
  END IF;

  -- The BSUID index (040) is the only thing stopping a username-only
  -- WhatsApp sender from forking a new contact per inbound message. A
  -- typo in its name would apply cleanly and guarantee nothing.
  IF to_regclass('public.idx_contacts_account_wa_user_id') IS NULL THEN
    RAISE EXCEPTION
      'idx_contacts_account_wa_user_id is missing — migration 040 did not apply';
  END IF;

  -- 041 repairs create_broadcast_with_recipients, which 037/038 shipped
  -- with an ambiguous bare `RETURNING id, contact_id` (SQLSTATE 42702 on
  -- first call — plpgsql resolves names at execution, not CREATE, so a
  -- plain replay can't catch it). Assert the qualified form is what's
  -- actually installed.
  IF pg_get_functiondef(
       'public.create_broadcast_with_recipients(uuid,uuid,text,text,text,integer,uuid[],jsonb)'::regprocedure
     ) NOT LIKE '%RETURNING id, broadcast_recipients.contact_id%' THEN
    RAISE EXCEPTION
      'create_broadcast_with_recipients still has the ambiguous RETURNING — migration 041 did not apply';
  END IF;

  IF to_regprocedure(
       'public.create_broadcast_with_recipients(uuid,uuid,text,text,text,integer,uuid[],jsonb[])'
     ) IS NOT NULL THEN
    RAISE EXCEPTION
      'the JSONB[] overload of create_broadcast_with_recipients still exists — migration 049 did not apply';
  END IF;

  -- The failure-reason columns (042) are only ever written by the
  -- status webhook, which uses an untyped update — a missing column
  -- there is a runtime PostgREST error on every failed send, not a
  -- compile error.
  IF (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name IN ('error_code', 'error_title', 'error_details')
  ) <> 3 THEN
    RAISE EXCEPTION
      'messages.error_code/error_title/error_details are missing — migration 042 did not apply';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd IN ('SELECT', 'ALL')
      AND (roles && ARRAY['public', 'anon']::name[])
      AND (qual LIKE '%avatars%' OR qual LIKE '%flow-media%' OR qual LIKE '%chat-media%')
  ) THEN
    RAISE EXCEPTION
      'a storage SELECT policy on avatars/flow-media/chat-media still applies to anon — migration 043 did not apply';
  END IF;
  IF (
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[]
      AND policyname IN (
        'Users can read their own avatar',
        'Members can read flow media',
        'Members can read chat media'
      )
  ) <> 3 THEN
    RAISE EXCEPTION
      'the scoped storage SELECT policies are missing — migration 043 did not apply';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public._bcast_bump(uuid,text,integer)',
      'public.recompute_broadcast_counts(uuid)',
      'public.claim_ai_reply_slot(uuid,integer)',
      'public.record_webhook_failure(uuid,integer)',
      'public.merge_duplicate_contacts()',
      'public.merge_duplicate_conversations()'
    ]::regprocedure[]) AS f(fn)
    WHERE has_function_privilege('anon', f.fn, 'EXECUTE')
       OR has_function_privilege('authenticated', f.fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', f.fn, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION
      'an internal SECURITY DEFINER function is still executable by anon/authenticated — migration 044 did not apply';
  END IF;

  -- 045 widens the automation_pending_executions status CHECK. It is a
  -- DROP + ADD by name, so a wrong constraint name would leave the old
  -- CHECK in place and every "wait for reply" park would be rejected at
  -- runtime, not at migration time.
  IF pg_get_constraintdef(
       (SELECT oid FROM pg_constraint
        WHERE conname = 'automation_pending_executions_status_check')
     ) NOT LIKE '%awaiting_reply%' THEN
    RAISE EXCEPTION
      'automation_pending_executions_status_check does not allow awaiting_reply — migration 045 did not apply';
  END IF;
  IF to_regclass('public.idx_automation_pending_awaiting_reply') IS NULL THEN
    RAISE EXCEPTION
      'idx_automation_pending_awaiting_reply is missing — migration 045 did not apply';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_default LIKE '%uuid_generate_v%'
  ) THEN
    RAISE EXCEPTION
      'a public column default still calls uuid-ossp; use gen_random_uuid() so a fresh hosted db push does not hit 42883';
  END IF;

  IF to_regprocedure('public.dashboard_overview(integer,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.dashboard_overview(integer, text, uuid) is missing - migration 072 did not apply';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'messages_track_conversation_times') THEN
    RAISE EXCEPTION 'messages_track_conversation_times trigger is missing — migration 059 did not apply';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'conversations_stamp_closed_at')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'deals_stamp_closed_at') THEN
    RAISE EXCEPTION 'closed_at triggers are missing — migration 059 did not apply';
  END IF;
  IF has_function_privilege('anon', 'public.dashboard_overview(integer,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute dashboard_overview - migration 072 grants are wrong';
  END IF;

  -- 060 adds the inbox banner's reason fields. A typo'd column here
  -- would apply cleanly and leave the banner silently unable to explain
  -- a pause at runtime.
  IF (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations'
      AND column_name IN ('ai_pause_reason', 'ai_paused_at')
  ) <> 2 THEN
    RAISE EXCEPTION
      'conversations.ai_pause_reason/ai_paused_at are missing - migration 060 did not apply';
  END IF;

  -- 061 adds inbox pin/snooze/follow-up + media retry identity.
  IF (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations'
      AND column_name IN ('is_pinned', 'snoozed_until', 'follow_up_at')
  ) <> 3 THEN
    RAISE EXCEPTION
      'conversations.is_pinned/snoozed_until/follow_up_at are missing - migration 061 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages'
      AND column_name = 'meta_media_id'
  ) THEN
    RAISE EXCEPTION 'messages.meta_media_id is missing - migration 061 did not apply';
  END IF;

  IF to_regclass('public.departments') IS NULL
     OR to_regclass('public.department_members') IS NULL THEN
    RAISE EXCEPTION 'departments/department_members are missing - migration 062 did not apply';
  END IF;

  IF (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'departments'
      AND column_name IN ('position_x', 'position_y')
  ) <> 2 THEN
    RAISE EXCEPTION
      'departments.position_x/position_y are missing - migration 063 did not apply';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'account_invitations'
      AND column_name = 'department_id'
  ) THEN
    RAISE EXCEPTION 'account_invitations.department_id is missing - migration 064 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'account_invitations_apply_department'
  ) THEN
    RAISE EXCEPTION 'account_invitations_apply_department trigger is missing - migration 064 did not apply';
  END IF;

  IF to_regclass('public.channels') IS NULL THEN
    RAISE EXCEPTION 'public.channels is missing - migration 065 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations'
      AND column_name = 'channel_id'
  ) THEN
    RAISE EXCEPTION 'conversations.channel_id is missing - migration 065 did not apply';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations'
      AND column_name = 'department_id'
  ) THEN
    RAISE EXCEPTION 'conversations.department_id is missing - migration 066 did not apply';
  END IF;

  IF to_regprocedure('public.can_access_channel(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.can_access_channel(uuid) is missing - migration 067 did not apply';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'channels'
      AND column_name = 'last_checked_at'
  ) THEN
    RAISE EXCEPTION 'channels.last_checked_at is missing - migration 068 did not apply';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'message_templates'
      AND column_name = 'channel_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'broadcasts'
      AND column_name = 'channel_id'
  ) THEN
    RAISE EXCEPTION 'message_templates/broadcasts.channel_id are missing - migration 069 did not apply';
  END IF;

  IF (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'channels'
      AND column_name IN (
        'display_phone_number', 'quality_rating', 'messaging_limit',
        'registered_at', 'last_registration_error', 'subscribed_at'
      )
  ) <> 6 THEN
    RAISE EXCEPTION
      'channel registration/health columns are missing - migration 070 did not apply';
  END IF;
  IF to_regprocedure('public.channel_performance(integer)') IS NULL THEN
    RAISE EXCEPTION 'public.channel_performance(integer) is missing - migration 070 did not apply';
  END IF;
  IF has_function_privilege('anon', 'public.channel_performance(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute channel_performance - migration 070 grants are wrong';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications'
      AND column_name = 'channel_id'
  ) OR pg_get_constraintdef(
       (SELECT oid FROM pg_constraint
        WHERE conname = 'notifications_type_check')
     ) NOT LIKE '%channel_health%' THEN
    RAISE EXCEPTION
      'notifications channel health support is missing - migration 071 did not apply';
  END IF;

  IF to_regprocedure('public.dashboard_overview(integer,text,uuid)') IS NULL THEN
    RAISE EXCEPTION
      'public.dashboard_overview(integer, text, uuid) is missing - migration 072 did not apply';
  END IF;
  IF has_function_privilege(
       'anon', 'public.dashboard_overview(integer,text,uuid)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'anon can execute dashboard_overview(integer,text,uuid) - migration 072 grants are wrong';
  END IF;

  IF pg_get_functiondef('public.redeem_invitation(text)'::regprocedure)
       NOT LIKE '%FROM channels WHERE account_id = v_old_account_id%' THEN
    RAISE EXCEPTION
      'redeem_invitation does not guard channel data - migration 073 did not apply';
  END IF;
  IF pg_get_functiondef('public.redeem_invitation(text)'::regprocedure)
       NOT LIKE '%FROM audit_logs WHERE account_id = v_old_account_id%' THEN
    RAISE EXCEPTION
      'redeem_invitation does not guard audit data - migration 080 did not apply';
  END IF;
  IF pg_get_functiondef('public.redeem_invitation(text)'::regprocedure)
       NOT LIKE '%FROM conversation_comments WHERE account_id = v_old_account_id%' THEN
    RAISE EXCEPTION
      'redeem_invitation does not guard conversation comments - migration 086 did not apply';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contact_notes'
      AND column_name = 'mentioned_user_ids'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_contact_note_mentions'
  ) THEN
    RAISE EXCEPTION
      'contact note mentions are missing - migration 075 did not apply';
  END IF;
  IF pg_get_constraintdef(
       (SELECT oid FROM pg_constraint
        WHERE conname = 'notifications_type_check')
     ) NOT LIKE '%mention%' THEN
    RAISE EXCEPTION
      'notifications_type_check does not allow mention - migration 075 did not apply';
  END IF;
  IF has_function_privilege(
       'authenticated', 'public.notify_contact_note_mentions()', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'authenticated can execute notify_contact_note_mentions - migration 075 grants are wrong';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'inbox_visibility'
  ) OR to_regprocedure('public.has_full_inbox_access(uuid)') IS NULL
     OR to_regprocedure('public.set_member_inbox_visibility(uuid,text)') IS NULL THEN
    RAISE EXCEPTION
      'private inbox helpers are missing - migration 076 did not apply';
  END IF;
  IF pg_get_functiondef(
       'public.dashboard_overview(integer,text,uuid)'::regprocedure
     ) NOT LIKE '%v_full_inbox%' THEN
    RAISE EXCEPTION
      'dashboard_overview does not respect inbox visibility - migration 077 did not apply';
  END IF;

  IF to_regclass('public.audit_logs') IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
      AND policyname = 'audit_logs_select'
  ) THEN
    RAISE EXCEPTION
      'audit_logs table/policy is missing - migration 078 did not apply';
  END IF;

  IF to_regprocedure('public.user_in_department_chain(uuid,uuid)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = 'conversations_assignee_area'
     ) THEN
    RAISE EXCEPTION
      'area assignee enforcement is missing - migration 083 did not apply';
  END IF;

  IF to_regclass('public.conversation_comments') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname = 'on_conversation_comment_mentions'
     ) THEN
    RAISE EXCEPTION
      'conversation comments are missing - migration 084 did not apply';
  END IF;
  IF pg_get_constraintdef(
       (SELECT oid FROM pg_constraint
        WHERE conname = 'notifications_type_check')
     ) NOT LIKE '%comment_mention%' THEN
    RAISE EXCEPTION
      'notifications_type_check does not allow comment_mention - migration 084 did not apply';
  END IF;

  IF pg_get_functiondef(
       'public.dashboard_overview(integer,text,uuid)'::regprocedure
     ) NOT LIKE '%hasChannel%' THEN
    RAISE EXCEPTION
      'dashboard setup fields are missing - migration 085 did not apply';
  END IF;

  IF (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'automation_steps'
      AND column_name IN ('position_x', 'position_y')
  ) <> 2 THEN
    RAISE EXCEPTION
      'automation_steps position columns are missing - migration 087 did not apply';
  END IF;

  IF to_regclass('public.automation_edges') IS NULL THEN
    RAISE EXCEPTION 'public.automation_edges is missing - migration 089 did not apply';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipelines'
      AND column_name = 'channel_id'
  ) THEN
    RAISE EXCEPTION
      'pipelines.channel_id is missing - migration 092 did not apply';
  END IF;

  RAISE NOTICE 'schema verification passed';
END
$$;

-- Two things this file has already been burned by, both verified in CI
-- rather than assumed:
--
-- 1. It must contain EXACTLY ONE statement. `supabase db query --file`
--    sends the whole file as a prepared statement, and a second
--    top-level statement fails with the distinctly unhelpful "cannot
--    insert multiple commands into a prepared statement" (commit
--    f91a6c8). Add assertions INSIDE the DO block above; do not append
--    a second one.
--
-- 2. A RAISE in here really does fail the job. A deliberately false
--    assertion (commit 42c7db0, run 31579334056) surfaced as
--    `failed to execute query: error: ...` and exited 1. This is not a
--    decorative green tick.
