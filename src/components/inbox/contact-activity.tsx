"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/types";
import {
  Activity,
  DollarSign,
  GitBranch,
  MessageSquare,
  Radio,
  StickyNote,
  Tag,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";

type ActivityKind =
  | "contact"
  | "note"
  | "tag"
  | "deal"
  | "message"
  | "flow"
  | "automation"
  | "broadcast";

interface ActivityEvent {
  id: string;
  at: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  tone?: "primary" | "amber" | "emerald" | "muted";
}

interface ActivityRow {
  [key: string]: unknown;
}

const ICON: Record<ActivityKind, LucideIcon> = {
  contact: UserPlus,
  note: StickyNote,
  tag: Tag,
  deal: DollarSign,
  message: MessageSquare,
  flow: GitBranch,
  automation: Zap,
  broadcast: Radio,
};

const TONE: Record<NonNullable<ActivityEvent["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-500/10 text-amber-500",
  emerald: "bg-emerald-500/10 text-emerald-500",
  muted: "bg-muted text-muted-foreground",
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function preview(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

export function ContactActivity({
  contact,
  showHeader = true,
}: {
  contact: Contact;
  showHeader?: boolean;
}) {
  const t = useTranslations("Inbox.activity");
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contact.id) return;
    const supabase = createClient();
    let cancelled = false;
    // Deferred so the effect body itself doesn't setState synchronously.
    const start = window.setTimeout(() => setLoading(true), 0);

    (async () => {
      const [convRes, notesRes, tagsRes, dealsRes, flowsRes, automationRes, broadcastRes] =
        await Promise.all([
          supabase
            .from("conversations")
            .select("id, status, created_at, closed_at, updated_at")
            .eq("contact_id", contact.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("contact_notes")
            .select("id, note_text, created_at")
            .eq("contact_id", contact.id)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("contact_tags")
            .select("id, created_at, tags(name, color)")
            .eq("contact_id", contact.id),
          supabase
            .from("deals")
            .select("id, title, value, currency, status, created_at, updated_at")
            .eq("contact_id", contact.id)
            .order("updated_at", { ascending: false })
            .limit(20),
          supabase
            .from("flow_runs")
            .select("id, status, started_at, ended_at, flow:flows(name)")
            .eq("contact_id", contact.id)
            .order("started_at", { ascending: false })
            .limit(10),
          supabase
            .from("automation_logs")
            .select(
              "id, status, trigger_event, created_at, automation:automations(name)",
            )
            .eq("contact_id", contact.id)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("broadcast_recipients")
            .select("id, status, created_at, broadcast:broadcasts(name)")
            .eq("contact_id", contact.id)
            .order("created_at", { ascending: false })
            .limit(10),
        ]);

      const conversations = (convRes.data ?? []) as ActivityRow[];
      let messages: ActivityRow[] = [];
      if (conversations.length > 0) {
        const { data } = await supabase
          .from("messages")
          .select(
            "id, sender_type, content_type, content_text, created_at, ai_generated",
          )
          .in(
            "conversation_id",
            conversations.map((c) => c.id as string),
          )
          .order("created_at", { ascending: false })
          .limit(20);
        messages = (data ?? []) as ActivityRow[];
      }

      if (cancelled) return;

      const out: ActivityEvent[] = [
        {
          id: "contact-created",
          at: contact.created_at,
          kind: "contact",
          title: t("contactCreated"),
          detail: contact.name || contact.phone || undefined,
        },
      ];

      for (const conversation of conversations) {
        const openedAt = conversation.created_at as string
        out.push({
          id: `conversation-open-${conversation.id}`,
          at: openedAt,
          kind: "message",
          title: t("conversationOpened"),
          tone: "primary",
        })
        if (
          conversation.status === "closed" ||
          typeof conversation.closed_at === "string"
        ) {
          out.push({
            id: `conversation-close-${conversation.id}`,
            at: (conversation.closed_at ?? conversation.updated_at) as string,
            kind: "message",
            title: t("conversationClosed"),
            tone: "muted",
          })
        }
      }

      for (const note of (notesRes.data ?? []) as ActivityRow[]) {
        out.push({
          id: `note-${note.id}`,
          at: note.created_at as string,
          kind: "note",
          title: t("noteAdded"),
          detail: preview(note.note_text, t("noteAdded")),
        });
      }

      for (const row of (tagsRes.data ?? []) as ActivityRow[]) {
        const tag = one(row.tags as { name?: string } | { name?: string }[] | null);
        out.push({
          id: `tag-${row.id}`,
          at: row.created_at as string,
          kind: "tag",
          title: t("tagAdded"),
          detail: tag?.name,
        });
      }

      for (const deal of (dealsRes.data ?? []) as ActivityRow[]) {
        const status = deal.status as string | undefined;
        const title =
          status === "won"
            ? t("dealWon")
            : status === "lost"
              ? t("dealLost")
              : t("dealCreated");
        const value =
          typeof deal.value === "number"
            ? `${deal.value.toLocaleString()}${deal.currency ? ` ${deal.currency}` : ""}`
            : undefined;
        out.push({
          id: `deal-${deal.id}`,
          at: (deal.updated_at ?? deal.created_at) as string,
          kind: "deal",
          title,
          detail: [deal.title, value].filter(Boolean).join(" · "),
          tone: status === "won" ? "emerald" : status === "lost" ? "amber" : "primary",
        });
      }

      for (const message of messages) {
        const ai = message.ai_generated === true;
        const customer = message.sender_type === "customer";
        out.push({
          id: `msg-${message.id}`,
          at: message.created_at as string,
          kind: "message",
          title: customer
            ? t("messageReceived")
            : ai
              ? t("messageSentAi")
              : t("messageSent"),
          detail: preview(
            message.content_text,
            typeof message.content_type === "string"
              ? `[${message.content_type}]`
              : t("messageSent"),
          ),
          tone: customer ? "muted" : ai ? "emerald" : "primary",
        });
      }

      for (const run of (flowsRes.data ?? []) as ActivityRow[]) {
        const status = run.status as string;
        const flow = one(
          run.flow as { name?: string } | { name?: string }[] | null,
        );
        const title =
          status === "completed"
            ? t("flowCompleted")
            : status === "handed_off"
              ? t("flowHandedOff")
              : status === "timed_out"
                ? t("flowTimedOut")
                : status === "failed"
                  ? t("flowFailed")
                  : t("flowStarted");
        out.push({
          id: `flow-${run.id}`,
          at: run.started_at as string,
          kind: "flow",
          title,
          detail: flow?.name,
          tone:
            status === "completed"
              ? "emerald"
              : status === "failed" || status === "timed_out"
                ? "amber"
                : "primary",
        });
      }

      for (const log of (automationRes.data ?? []) as ActivityRow[]) {
        const automation = one(
          log.automation as { name?: string } | { name?: string }[] | null,
        );
        out.push({
          id: `automation-${log.id}`,
          at: log.created_at as string,
          kind: "automation",
          title: t("automationRan"),
          detail: automation?.name,
          tone: log.status === "failed" ? "amber" : "muted",
        });
      }

      for (const recipient of (broadcastRes.data ?? []) as ActivityRow[]) {
        const broadcast = one(
          recipient.broadcast as
            | { name?: string }
            | { name?: string }[]
            | null,
        );
        out.push({
          id: `broadcast-${recipient.id}`,
          at: recipient.created_at as string,
          kind: "broadcast",
          title: t("broadcastReceived"),
          detail: broadcast?.name,
          tone: "muted",
        });
      }

      out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setEvents(out.slice(0, 40));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [contact, t]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <p className="px-1 text-xs text-muted-foreground">{t("loading")}</p>
      );
    }
    if (events.length === 0) {
      return <p className="px-1 text-xs text-muted-foreground">{t("empty")}</p>;
    }
    return (
      <div className="relative mt-2 space-y-3 before:absolute before:bottom-1 before:left-3 before:top-1 before:w-px before:bg-border">
        {events.map((event) => {
          const Icon = ICON[event.kind];
          return (
            <div key={event.id} className="relative flex gap-2.5">
              <span
                className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${TONE[event.tone ?? "muted"]}`}
              >
                <Icon className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1 pb-0.5">
                <p className="text-xs font-medium text-foreground">
                  {event.title}
                </p>
                {event.detail && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {event.detail}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(event.at), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [loading, events, t]);

  return (
    <div>
      {showHeader && (
        <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3 w-3" />
          {t("title")}
        </div>
      )}
      {content}
    </div>
  );
}
