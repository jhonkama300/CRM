import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit/log";

type BulkAction = "mark_read" | "close" | "assign" | "tag" | "delete";

interface BulkBody {
  conversation_ids?: unknown;
  action?: unknown;
  assigned_agent_id?: unknown;
  tag_id?: unknown;
}

const MAX_IDS = 100;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/inbox/bulk
 *
 * Apply one inbox operation to a bounded set of conversations. Runs
 * through the RLS-scoped supabase client, so a conversation outside the
 * caller's account is never touched. Agent+ only, matching the same
 * gate as sending and assignment.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId, role } = await requireRole("agent");
    const limit = checkRateLimit(`inbox-bulk:${userId}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as BulkBody | null;
    if (!body) return bad("Invalid request body");

    const ids = Array.isArray(body.conversation_ids)
      ? [...new Set(body.conversation_ids.filter((id): id is string => typeof id === "string"))]
      : [];
    if (ids.length === 0) return bad("No conversations selected");
    if (ids.length > MAX_IDS) return bad(`Too many conversations (max ${MAX_IDS})`);

    const action = body.action as BulkAction;
    if (!["mark_read", "close", "assign", "tag", "delete"].includes(action)) {
      return bad("Unknown bulk action");
    }

    const base = supabase
      .from("conversations")
      .select("id")
      .eq("account_id", accountId)
      .in("id", ids);
    const { data: owned, error: ownErr } = await base;
    if (ownErr) return bad(ownErr.message, 500);
    const ownedIds = (owned ?? []).map((row) => row.id as string);
    if (ownedIds.length === 0) return NextResponse.json({ updated: 0 });

    if (action === "delete") {
      if (role !== "owner" && role !== "admin") {
        return bad("Only admins can delete conversations", 403);
      }
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("account_id", accountId)
        .in("id", ownedIds);
      if (error) return bad(error.message, 500);
      await recordAudit({
        accountId,
        actorUserId: userId,
        action: "conversations.deleted",
        entityType: "conversation",
        metadata: { conversation_ids: ownedIds, count: ownedIds.length },
      });
      return NextResponse.json({ deleted: ownedIds.length });
    }

    if (action === "tag") {
      const tagId = typeof body.tag_id === "string" ? body.tag_id : "";
      if (!tagId) return bad("tag_id is required");
      const { data: tag } = await supabase
        .from("tags")
        .select("id")
        .eq("id", tagId)
        .eq("account_id", accountId)
        .maybeSingle();
      if (!tag) return bad("Tag not found", 404);

      const { data: convs, error: convErr } = await supabase
        .from("conversations")
        .select("id, contact_id")
        .eq("account_id", accountId)
        .in("id", ownedIds);
      if (convErr) return bad(convErr.message, 500);

      const contactIds = [
        ...new Set(
          (convs ?? [])
            .map((c) => c.contact_id)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      if (contactIds.length > 0) {
        const rows = contactIds.map((contactId) => ({
          contact_id: contactId,
          tag_id: tagId,
        }));
        const { error } = await supabase
          .from("contact_tags")
          .upsert(rows, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
        if (error) return bad(error.message, 500);
      }
      return NextResponse.json({
        updated: ownedIds.length,
        contacts_updated: contactIds.length,
      });
    }

    if (action === "assign") {
      const assigned =
        body.assigned_agent_id === null
          ? null
          : typeof body.assigned_agent_id === "string"
            ? body.assigned_agent_id
            : undefined;
      if (assigned === undefined) return bad("assigned_agent_id is required");
      if (assigned) {
        const { data: member } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("account_id", accountId)
          .eq("user_id", assigned)
          .maybeSingle();
        if (!member) return bad("Assignee is not a member of this account", 404);
      }
      const { error } = await supabase
        .from("conversations")
        .update({ assigned_agent_id: assigned })
        .eq("account_id", accountId)
        .in("id", ownedIds);
      if (error) return bad(error.message, 500);
      return NextResponse.json({ updated: ownedIds.length });
    }

    const patch =
      action === "mark_read"
        ? { unread_count: 0 }
        : {
            status: "closed" as const,
            closed_at: new Date().toISOString(),
            unread_count: 0,
          };

    const { error } = await supabase
      .from("conversations")
      .update(patch)
      .eq("account_id", accountId)
      .in("id", ownedIds);
    if (error) return bad(error.message, 500);
    return NextResponse.json({ updated: ownedIds.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
