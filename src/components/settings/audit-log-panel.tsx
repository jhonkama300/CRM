"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCan } from "@/hooks/use-can";
import { fetchAccountMembers, memberLabel } from "@/lib/account/members";
import type { AccountMember } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import {
  FileText,
  Loader2,
  MessageSquare,
  Plug,
  Radio,
  ScrollText,
  Shield,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ACTIONS = [
  "conversations.deleted",
  "conversation.deleted",
  "member.created",
  "member.invited",
  "member.role_changed",
  "member.inbox_visibility_changed",
  "channel.created",
  "channel.updated",
  "channel.deleted",
  "template.submitted",
  "broadcast.sent",
  "whatsapp_config.saved",
] as const;

const ACTION_ICON: Record<string, typeof ScrollText> = {
  conversations: Trash2,
  conversation: Trash2,
  member: Shield,
  channel: Plug,
  template: FileText,
  broadcast: Radio,
  whatsapp_config: MessageSquare,
};

function iconFor(action: string) {
  return ACTION_ICON[action.split(".")[0]] ?? ScrollText;
}

export function AuditLogPanel() {
  const t = useTranslations("Settings.audit");
  const canView = useCan("edit-settings");
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("__all__");

  const load = useCallback(async () => {
    const [{ data, error }, memberRows] = await Promise.all([
      supabase
        .from("audit_logs")
        .select(
          "id, actor_user_id, action, entity_type, entity_id, metadata, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      fetchAccountMembers(),
    ]);
    if (error) console.error("[audit] load failed:", error.message);
    setRows((data ?? []) as AuditRow[]);
    setMembers(memberRows);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canView) void load();
  }, [canView, load]);

  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) map.set(member.user_id, memberLabel(member));
    return map;
  }, [members]);

  const visible = action === "__all__" ? rows : rows.filter((r) => r.action === action);

  if (!canView) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        {t("noAccess")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Select value={action} onValueChange={(v) => setAction(v ?? "__all__")}>
          <SelectTrigger className="w-56 bg-muted border-border text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("allActions")}</SelectItem>
            {ACTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`actions.${value.replace(/\./g, "_")}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center rounded-xl border border-border py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <ScrollText className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {visible.map((row) => {
              const Icon = iconFor(row.action);
              const actor = row.actor_user_id
                ? memberNames.get(row.actor_user_id) ?? t("unknownActor")
                : t("systemActor");
              const detail = describe(row);
              return (
                <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {t(`actions.${row.action.replace(/\./g, "_")}`)}
                      </p>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {row.entity_type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {actor}
                      {detail ? ` · ${detail}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(row.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function describe(row: AuditRow): string {
  const meta = row.metadata ?? {};
  if (typeof meta.name === "string") return meta.name;
  if (typeof meta.template_name === "string") return meta.template_name;
  if (typeof meta.role === "string") return meta.role;
  if (typeof meta.visibility === "string") return meta.visibility;
  if (typeof meta.count === "number") return `${meta.count}`;
  if (typeof meta.sent === "number" || typeof meta.failed === "number") {
    return `${String(meta.sent ?? 0)} / ${String(meta.failed ?? 0)}`;
  }
  return "";
}
