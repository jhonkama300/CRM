import type { SupabaseClient } from "@supabase/supabase-js";

import { decrypt } from "@/lib/whatsapp/encryption";

export interface AccountMetaCredentials {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string | null;
  channelId: string | null;
  source: "channel" | "legacy";
}

interface ChannelRow {
  id: string;
  phone_number_id: string | null;
  waba_id: string | null;
  access_token: string | null;
  status: string | null;
}

interface LegacyRow {
  phone_number_id: string | null;
  waba_id: string | null;
  access_token: string | null;
}

function usableChannel(row: ChannelRow): boolean {
  return Boolean(row.phone_number_id && row.access_token);
}

export async function loadAccountMetaCredentials(
  db: SupabaseClient,
  accountId: string,
  channelId?: string | null,
): Promise<AccountMetaCredentials> {
  let channels: ChannelRow[] = [];
  try {
    let query = db
      .from("channels")
      .select("id, phone_number_id, waba_id, access_token, status")
      .eq("account_id", accountId);

    if (channelId) {
      query = query.eq("id", channelId);
    }

    const { data: channelRows } = await query.order("created_at", {
      ascending: true,
    });
    channels = ((channelRows ?? []) as ChannelRow[]).filter(usableChannel);
  } catch {
    channels = [];
  }
  const channel =
    channels.find((row) => (channelId ? true : row.status === "connected")) ??
    channels[0] ??
    null;

  if (channel) {
    return {
      phoneNumberId: channel.phone_number_id!,
      accessToken: decrypt(channel.access_token!),
      wabaId: channel.waba_id ?? null,
      channelId: channel.id,
      source: "channel",
    };
  }

  let config: LegacyRow | null = null;
  try {
    const query = db
      .from("whatsapp_config")
      .select("phone_number_id, waba_id, access_token")
      .eq("account_id", accountId);
    const result =
      typeof query.single === "function"
        ? await query.single()
        : typeof query.maybeSingle === "function"
          ? await query.maybeSingle()
          : { data: null };
    config = (result.data ?? null) as LegacyRow | null;
  } catch {
    config = null;
  }

  if (config?.access_token) {
    return {
      phoneNumberId: config.phone_number_id ?? "",
      accessToken: decrypt(config.access_token),
      wabaId: config.waba_id ?? null,
      channelId: null,
      source: "legacy",
    };
  }

  const error = new Error(
    "WhatsApp not configured. Please set up your WhatsApp integration first.",
  );
  error.name = "WhatsAppNotConfiguredError";
  throw error;
}
