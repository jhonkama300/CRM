import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { recordAudit } from "@/lib/audit/log";

type Params = { params: Promise<{ id: string }> };

interface PatchBody {
  is_pinned?: unknown;
  snoozed_until?: unknown;
  follow_up_at?: unknown;
  assigned_agent_id?: unknown;
}

function isoOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * PATCH /api/inbox/conversations/[id]
 *
 * Lightweight per-conversation controls: pin, snooze, follow-up and
 * assignment. Bulk operations live in /api/inbox/bulk.
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase, accountId, userId } = await requireRole("admin");
    const { id } = await params;

    const { data, error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id)
      .eq("account_id", accountId)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    await recordAudit({
      accountId,
      actorUserId: userId,
      action: "conversation.deleted",
      entityType: "conversation",
      entityId: data.id,
    });
    return NextResponse.json({ deleted: true, id: data.id });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole("agent");
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};

    if ("is_pinned" in body) {
      if (typeof body.is_pinned !== "boolean") {
        return NextResponse.json({ error: "is_pinned must be boolean" }, { status: 400 });
      }
      patch.is_pinned = body.is_pinned;
    }

    if ("snoozed_until" in body) {
      const parsed = isoOrNull(body.snoozed_until);
      if (parsed === undefined) {
        return NextResponse.json({ error: "Invalid snoozed_until" }, { status: 400 });
      }
      patch.snoozed_until = parsed;
    }

    if ("follow_up_at" in body) {
      const parsed = isoOrNull(body.follow_up_at);
      if (parsed === undefined) {
        return NextResponse.json({ error: "Invalid follow_up_at" }, { status: 400 });
      }
      patch.follow_up_at = parsed;
    }

    if ("assigned_agent_id" in body) {
      const assigned =
        body.assigned_agent_id === null
          ? null
          : typeof body.assigned_agent_id === "string"
            ? body.assigned_agent_id
            : undefined;
      if (assigned === undefined) {
        return NextResponse.json(
          { error: "assigned_agent_id must be a string or null" },
          { status: 400 },
        );
      }
      if (assigned) {
        const { data: member } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("account_id", accountId)
          .eq("user_id", assigned)
          .maybeSingle();
        if (!member) {
          return NextResponse.json(
            { error: "Assignee is not a member of this account" },
            { status: 404 },
          );
        }
      }
      patch.assigned_agent_id = assigned;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", id)
      .eq("account_id", accountId)
      .select(
        "id, is_pinned, snoozed_until, follow_up_at, assigned_agent_id",
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return NextResponse.json({ conversation: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
