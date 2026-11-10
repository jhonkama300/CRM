import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";

function tierLimit(tier: string | null | undefined): number | null {
  switch ((tier ?? "").toUpperCase()) {
    case "TIER_1K":
      return 1_000;
    case "TIER_10K":
      return 10_000;
    case "TIER_100K":
      return 100_000;
    case "TIER_1M":
      return 1_000_000;
    default:
      return null;
  }
}

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole("viewer");
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channel_id");
    const now = new Date();
    const to = parseDate(url.searchParams.get("to"), now);
    const from = parseDate(
      url.searchParams.get("from"),
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    );

    if (from > to) {
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 },
      );
    }

    const { data: channels, error: channelError } = await supabase
      .from("channels")
      .select(
        "id, name, color, status, phone_number_id, display_phone_number, messaging_limit, quality_rating",
      )
      .eq("account_id", accountId)
      .order("name");

    if (channelError) {
      return NextResponse.json(
        { error: channelError.message },
        { status: 500 },
      );
    }

    const channel = channelId
      ? (channels ?? []).find((row) => row.id === channelId)
      : null;

    if (channelId && !channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("channel_usage_stats", {
      p_channel_id: channelId || null,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const limit = channel ? tierLimit(channel.messaging_limit) : null;
    return NextResponse.json({
      stats: data,
      channel: channel ?? null,
      limit,
      channels: channels ?? [],
      range: { from: from.toISOString(), to: to.toISOString() },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
