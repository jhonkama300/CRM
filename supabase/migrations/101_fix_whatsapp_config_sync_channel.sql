-- ============================================================
-- 101_fix_whatsapp_config_sync_channel.sql
--
-- The legacy whatsapp_config -> channels sync trigger used
-- `INSERT ... ON CONFLICT (source_config_id)`, which only matches a
-- channel previously created by this same config. When a number was
-- first connected from Settings -> Channels, saving the legacy
-- WhatsApp form hit the unique `channels.phone_number_id` constraint
-- and surfaced as "new row violates row-level security policy".
--
-- Match an existing channel by phone_number_id + account_id first,
-- and run the function as SECURITY DEFINER so the sync does not
-- depend on the caller's channel write policy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_whatsapp_config_to_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  UPDATE public.channels
  SET
    account_id = NEW.account_id,
    user_id = NEW.user_id,
    source_config_id = NEW.id,
    waba_id = NEW.waba_id,
    access_token = NEW.access_token,
    verify_token = NEW.verify_token,
    status = NEW.status,
    mirror_inbound_media = COALESCE(NEW.mirror_inbound_media, true)
  WHERE phone_number_id = NEW.phone_number_id
    AND account_id = NEW.account_id;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.channels (
    account_id,
    user_id,
    source_config_id,
    name,
    phone_number_id,
    waba_id,
    access_token,
    verify_token,
    status,
    mirror_inbound_media
  ) VALUES (
    NEW.account_id,
    NEW.user_id,
    NEW.id,
    'Principal',
    NEW.phone_number_id,
    NEW.waba_id,
    NEW.access_token,
    NEW.verify_token,
    NEW.status,
    COALESCE(NEW.mirror_inbound_media, true)
  )
  ON CONFLICT (source_config_id) DO UPDATE SET
    account_id = EXCLUDED.account_id,
    user_id = EXCLUDED.user_id,
    phone_number_id = EXCLUDED.phone_number_id,
    waba_id = EXCLUDED.waba_id,
    access_token = EXCLUDED.access_token,
    verify_token = EXCLUDED.verify_token,
    status = EXCLUDED.status,
    mirror_inbound_media = EXCLUDED.mirror_inbound_media;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_whatsapp_config_to_channel() OWNER TO postgres;
