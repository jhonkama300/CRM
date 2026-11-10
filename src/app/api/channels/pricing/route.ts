import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";

const RATE_FIELDS = [
  "marketing_rate",
  "utility_rate",
  "authentication_rate",
  "service_rate",
] as const;

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole("viewer");
    const channelId = new URL(request.url).searchParams.get("channel_id");
    if (!channelId) {
      return NextResponse.json(
        { error: "channel_id is required" },
        { status: 400 },
      );
    }

    const { data: channel } = await supabase
      .from("channels")
      .select("id")
      .eq("id", channelId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("channel_pricing_rates")
      .select(
        "channel_id, currency, marketing_rate, utility_rate, authentication_rate, service_rate, updated_at",
      )
      .eq("channel_id", channelId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rates: data ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole("admin");
    const body = await request.json().catch(() => null);
    const channelId =
      body && typeof body.channel_id === "string" ? body.channel_id : "";
    if (!channelId) {
      return NextResponse.json(
        { error: "channel_id is required" },
        { status: 400 },
      );
    }

    const { data: channel } = await supabase
      .from("channels")
      .select("id")
      .eq("id", channelId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const rates: Record<string, number> = {};
    for (const field of RATE_FIELDS) {
      const value = Number(body?.[field] ?? 0);
      if (!Number.isFinite(value) || value < 0) {
        return NextResponse.json(
          { error: `Invalid ${field}` },
          { status: 400 },
        );
      }
      rates[field] = value;
    }

    const { data, error } = await supabase
      .from("channel_pricing_rates")
      .upsert(
        {
          account_id: accountId,
          channel_id: channelId,
          currency: "COP",
          ...rates,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "channel_id" },
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rates: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
