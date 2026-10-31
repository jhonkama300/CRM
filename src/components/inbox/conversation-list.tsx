"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import {
  applyInboxFilter,
  attentionLevel,
  isFollowUpDue,
  isSnoozed,
  minutesWaiting,
  type InboxFilter,
} from "@/lib/inbox/inbox-filters";
import { cn } from "@/lib/utils";
import type {
  AccountMember,
  Conversation,
  ConversationStatus,
  Tag,
} from "@/types";
import {
  Search,
  X,
  MoreVertical,
  Pin,
  PinOff,
  Clock3,
  Bell,
  BellOff,
  CheckCheck,
  CheckSquare,
  Square,
  Filter,
  Tag as TagIcon,
  UserPlus,
  UserRoundX,
  Archive,
  Users,
  Inbox as InboxIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAccountMembers,
  memberLabel,
} from "@/lib/account/members";
import { toast } from "sonner";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  resyncToken?: number;
  initialFilter?: InboxFilter;
  /** Patch local state after a bulk action. */
  onBulkUpdated?: (ids: string[], patch: Partial<Conversation>) => void;
  /** Patch local state after pin/snooze/follow-up/assignment. */
  onConversationPatched?: (id: string, patch: Partial<Conversation>) => void;
  /** Ask the page to refetch conversations (used after adding tags). */
  onRequestResync?: () => void;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-muted-foreground",
};

const ATTENTION_DOT: Record<string, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

const TABS: { value: InboxFilter; key: string }[] = [
  { value: "all", key: "filterAll" },
  { value: "unread", key: "filterUnread" },
  { value: "waiting", key: "filterWaiting" },
  { value: "unassigned", key: "filterUnassigned" },
  { value: "expiring", key: "filterExpiring" },
];

function futureIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function tomorrowMorningIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
  initialFilter = "all",
  onBulkUpdated,
  onConversationPatched,
  onRequestResync,
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [resyncToken]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    void fetchAccountMembers().then((rows) => {
      if (!cancelled) setMembers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const channels = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const c of conversations) {
      if (c.channel) map.set(c.channel.id, c.channel);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations]);

  const departments = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const c of conversations) {
      if (c.department) map.set(c.department.id, c.department);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const tag of tags) m.set(tag.id, tag);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    let result = applyInboxFilter(conversations, filter, now);

    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        }),
      );
    }

    if (selectedChannelId) {
      result = result.filter((c) => c.channel_id === selectedChannelId);
    }
    if (selectedDepartmentId) {
      result = result.filter((c) => c.department_id === selectedDepartmentId);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    // Pinned first, then the filter's own ordering.
    return [...result].sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
      return 0;
    });
  }, [conversations, filter, now, search, selectedTagIds, selectedCompany, selectedChannelId, selectedDepartmentId]);

  const counts = useMemo(() => {
    const out: Partial<Record<InboxFilter, number>> = {};
    for (const tab of TABS) {
      out[tab.value] = applyInboxFilter(conversations, tab.value, now).length;
    }
    return out;
  }, [conversations, now]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
    setSelectedChannelId(null);
    setSelectedDepartmentId(null);
  }, []);

  const hasContactFilters =
    selectedTagIds.length > 0 ||
    selectedCompany !== null ||
    selectedChannelId !== null ||
    selectedDepartmentId !== null;
  const advancedActive =
    hasContactFilters || ["open", "pending", "closed"].includes(filter);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length && filtered.every((c) => prev.has(c.id))) {
        return new Set();
      }
      return new Set(filtered.map((c) => c.id));
    });
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const runBulk = useCallback(
    async (
      action: "mark_read" | "close" | "assign" | "tag",
      payload: Record<string, unknown> = {},
      patch: Partial<Conversation> = {},
    ) => {
      if (selectedIds.size === 0) return;
      setBulkBusy(true);
      try {
        const ids = [...selectedIds];
        const res = await fetch("/api/inbox/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_ids: ids, action, ...payload }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data?.error ?? t("bulkFailed"));
          return;
        }
        if (action === "tag") {
          onRequestResync?.();
        } else {
          onBulkUpdated?.(ids, patch);
        }
        clearSelection();
        toast.success(t("bulkDone"));
      } catch {
        toast.error(t("networkError"));
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedIds, onBulkUpdated, onRequestResync, clearSelection, t],
  );

  const patchConversation = useCallback(
    async (id: string, patch: Partial<Conversation>) => {
      try {
        const res = await fetch(`/api/inbox/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data?.error ?? t("updateFailed"));
          return;
        }
        onConversationPatched?.(id, patch);
      } catch {
        toast.error(t("networkError"));
      }
    },
    [onConversationPatched, t],
  );

  const activeFilter = [...TABS.map((x) => ({ ...x, value: x.value })),
    { value: "open" as InboxFilter, key: "filterOpen" },
    { value: "pending" as InboxFilter, key: "filterPending" },
    { value: "closed" as InboxFilter, key: "filterClosed" },
  ].find((o) => o.value === filter);

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-card lg:w-80">
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="border-border bg-muted pl-9 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50"
          />
        </div>

        {/* Primary tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {TABS.map((tab) => {
            const active = filter === tab.value;
            const count = counts[tab.value] ?? 0;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(tab.key)}
                <span
                  className={cn(
                    "rounded-full px-1 text-[10px]",
                    active ? "bg-primary/15" : "bg-muted",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
          <Popover>
            <PopoverTrigger
              className={cn(
                "ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs",
                advancedActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Filter className="h-3 w-3" />
              {t("filters")}
              {advancedActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3 border-border bg-popover p-3">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("status")}
                </p>
                <div className="flex flex-wrap gap-1">
                  {(["open", "pending", "closed"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFilter(filter === s ? "all" : s)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs",
                        filter === s
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {t(s === "open" ? "filterOpen" : s === "pending" ? "filterPending" : "filterClosed")}
                    </button>
                  ))}
                </div>
              </div>

              {tags.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("tags")}
                  </p>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs",
                          selectedTagIds.includes(tag.id)
                            ? "bg-primary/10 text-primary"
                            : "text-popover-foreground hover:bg-muted",
                        )}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="truncate">{tag.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {channels.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('channel')}
                  </p>
                  <div className="max-h-28 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedChannelId(null)}
                      className={cn(
                        "flex w-full rounded-md px-2 py-1 text-left text-xs",
                        selectedChannelId === null
                          ? "bg-primary/10 text-primary"
                          : "text-popover-foreground hover:bg-muted",
                      )}
                    >
                      {t('allChannels')}
                    </button>
                    {channels.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => setSelectedChannelId(channel.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs",
                          selectedChannelId === channel.id
                            ? "bg-primary/10 text-primary"
                            : "text-popover-foreground hover:bg-muted",
                        )}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: channel.color }}
                        />
                        <span className="truncate">{channel.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {departments.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('department')}
                  </p>
                  <div className="max-h-28 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedDepartmentId(null)}
                      className={cn(
                        "flex w-full rounded-md px-2 py-1 text-left text-xs",
                        selectedDepartmentId === null
                          ? "bg-primary/10 text-primary"
                          : "text-popover-foreground hover:bg-muted",
                      )}
                    >
                      {t('allDepartments')}
                    </button>
                    {departments.map((department) => (
                      <button
                        key={department.id}
                        type="button"
                        onClick={() => setSelectedDepartmentId(department.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs",
                          selectedDepartmentId === department.id
                            ? "bg-primary/10 text-primary"
                            : "text-popover-foreground hover:bg-muted",
                        )}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: department.color }}
                        />
                        <span className="truncate">{department.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {companies.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("company")}
                  </p>
                  <div className="max-h-28 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedCompany(null)}
                      className={cn(
                        "flex w-full rounded-md px-2 py-1 text-left text-xs",
                        selectedCompany === null
                          ? "bg-primary/10 text-primary"
                          : "text-popover-foreground hover:bg-muted",
                      )}
                    >
                      {t("allCompanies")}
                    </button>
                    {companies.map((co) => (
                      <button
                        key={co}
                        type="button"
                        onClick={() => setSelectedCompany(co)}
                        className={cn(
                          "flex w-full rounded-md px-2 py-1 text-left text-xs",
                          selectedCompany === co
                            ? "bg-primary/10 text-primary"
                            : "text-popover-foreground hover:bg-muted",
                        )}
                      >
                        <span className="truncate">{co}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {advancedActive && (
                <button
                  type="button"
                  onClick={() => {
                    clearContactFilters();
                    if (["open", "pending", "closed"].includes(filter)) setFilter("all");
                  }}
                  className="w-full rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  {t("clearAll")}
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {hasContactFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag?.color ?? "var(--muted-foreground)" }}
                  />
                  <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                onClick={() => setSelectedCompany(null)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearContactFilters}
              className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("clearAll")}
            </button>
          </div>
        )}

        {filter !== "all" && !["unread", "waiting", "unassigned", "expiring"].includes(filter) && (
          <p className="text-[11px] text-muted-foreground">
            {t("activeFilter", { filter: activeFilter ? t(activeFilter.key) : filter })}
          </p>
        )}

        {/* Bulk bar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-primary/20 bg-primary/5 p-1.5">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-primary"
            >
              <CheckCheck className="h-3 w-3" />
              {t("selectAll")}
            </button>
            <span className="text-[11px] text-muted-foreground">
              {t("selectedCount", { count: selectedIds.size })}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void runBulk("mark_read", {}, { unread_count: 0 })}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("markRead")}
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={bulkBusy}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t("assign")}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-border bg-popover">
                  <DropdownMenuItem
                    onClick={() => void runBulk("assign", { assigned_agent_id: null }, { assigned_agent_id: null })}
                    className="text-sm text-popover-foreground"
                  >
                    <UserRoundX className="mr-2 h-3.5 w-3.5" />
                    {t("unassign")}
                  </DropdownMenuItem>
                  {members.map((m) => (
                    <DropdownMenuItem
                      key={m.user_id}
                      onClick={() =>
                        void runBulk(
                          "assign",
                          { assigned_agent_id: m.user_id },
                          { assigned_agent_id: m.user_id },
                        )
                      }
                      className="text-sm text-popover-foreground"
                    >
                      <Users className="mr-2 h-3.5 w-3.5" />
                      {memberLabel(m)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={bulkBusy || tags.length === 0}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t("addTag")}
                >
                  <TagIcon className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-border bg-popover">
                  {tags.map((tag) => (
                    <DropdownMenuItem
                      key={tag.id}
                      onClick={() => void runBulk("tag", { tag_id: tag.id })}
                      className="text-sm text-popover-foreground"
                    >
                      <span
                        className="mr-2 h-2 w-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                disabled={bulkBusy}
                onClick={() =>
                  void runBulk("close", {}, { status: "closed", unread_count: 0 })
                }
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("closeSelected")}
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("clearSelection")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <InboxIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                selected={selectedIds.has(conv.id)}
                now={now}
                members={members}
                currentUserId={user?.id}
                onSelect={onSelect}
                onToggleSelected={toggleSelected}
                onPin={(pinned) => void patchConversation(conv.id, { is_pinned: pinned })}
                onSnooze={(until) => void patchConversation(conv.id, { snoozed_until: until })}
                onFollowUp={(at) => void patchConversation(conv.id, { follow_up_at: at })}
                onAssign={(agentId) =>
                  void patchConversation(conv.id, { assigned_agent_id: agentId })
                }
                t={t}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  selected: boolean;
  now: number;
  members: AccountMember[];
  currentUserId?: string;
  onSelect: (conversation: Conversation) => void;
  onToggleSelected: (id: string) => void;
  onPin: (pinned: boolean) => void;
  onSnooze: (until: string | null) => void;
  onFollowUp: (at: string | null) => void;
  onAssign: (agentId: string | null) => void;
  t: ReturnType<typeof useTranslations>;
}

function ConversationItem({
  conversation,
  isActive,
  selected,
  now,
  members,
  currentUserId,
  onSelect,
  onToggleSelected,
  onPin,
  onSnooze,
  onFollowUp,
  onAssign,
  t,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");
  const initials = displayName.charAt(0).toUpperCase();
  const attention = attentionLevel(conversation, now);
  const waitingMinutes = minutesWaiting(conversation, now);
  const snoozed = isSnoozed(conversation, now);
  const followUpDue = isFollowUpDue(conversation, now);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : "";

  const handleClick = () => onSelect(conversation);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group flex w-full items-start gap-2 px-2 py-3 text-left transition-colors hover:bg-muted/50",
        isActive && "border-l-2 border-primary bg-muted/70",
        selected && "bg-primary/5",
      )}
    >
      <button
        type="button"
        aria-label={t("selectConversation")}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelected(conversation.id);
        }}
        className="mt-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        {selected ? (
          <CheckSquare className="h-4 w-4 text-primary" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </button>

      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
        {attention !== "none" && (
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
              ATTENTION_DOT[attention],
            )}
            title={t("waitingFor", { time: `${waitingMinutes}m` })}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 truncate text-sm font-medium text-foreground">
            {conversation.is_pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
            <span className="truncate">{displayName}</span>
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {conversation.channel && (
              <span
                className="mr-1 font-medium"
                style={{ color: conversation.channel.color }}
              >
                {conversation.channel.name}
                {conversation.department ? ` · ${conversation.department.name}` : ""} ·
              </span>
            )}
            {snoozed
              ? t("snoozedUntil", { time: formatDistanceToNow(new Date(conversation.snoozed_until!), { addSuffix: true }) })
              : conversation.follow_up_at
                ? t("followUp", { time: formatDistanceToNow(new Date(conversation.follow_up_at), { addSuffix: true }) })
                : conversation.last_message_text || t("noMessagesYet")}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {followUpDue && <Bell className="h-3 w-3 text-amber-500" />}
            {snoozed && <Clock3 className="h-3 w-3 text-muted-foreground" />}
            {conversation.unread_count > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conversation.unread_count}
              </span>
            )}
            <span
              className={cn("h-2 w-2 rounded-full", STATUS_COLORS[conversation.status])}
              title={conversation.status}
            />
          </div>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 data-[popup-open]:opacity-100"
          aria-label={t("moreActions")}
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 border-border bg-popover">
          <DropdownMenuItem
            onClick={() => onPin(!conversation.is_pinned)}
            className="text-sm text-popover-foreground"
          >
            {conversation.is_pinned ? (
              <PinOff className="mr-2 h-3.5 w-3.5" />
            ) : (
              <Pin className="mr-2 h-3.5 w-3.5" />
            )}
            {conversation.is_pinned ? t("unpin") : t("pin")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onSnooze(futureIso(1))} className="text-sm text-popover-foreground">
            <Clock3 className="mr-2 h-3.5 w-3.5" />
            {t("snooze1h")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSnooze(futureIso(3))} className="text-sm text-popover-foreground">
            <Clock3 className="mr-2 h-3.5 w-3.5" />
            {t("snooze3h")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSnooze(tomorrowMorningIso())} className="text-sm text-popover-foreground">
            <Clock3 className="mr-2 h-3.5 w-3.5" />
            {t("snoozeTomorrow")}
          </DropdownMenuItem>
          {conversation.snoozed_until && (
            <DropdownMenuItem onClick={() => onSnooze(null)} className="text-sm text-popover-foreground">
              <BellOff className="mr-2 h-3.5 w-3.5" />
              {t("unsnooze")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onFollowUp(futureIso(2))} className="text-sm text-popover-foreground">
            <Bell className="mr-2 h-3.5 w-3.5" />
            {t("followUp2h")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onFollowUp(tomorrowMorningIso())} className="text-sm text-popover-foreground">
            <Bell className="mr-2 h-3.5 w-3.5" />
            {t("followUpTomorrow")}
          </DropdownMenuItem>
          {conversation.follow_up_at && (
            <DropdownMenuItem onClick={() => onFollowUp(null)} className="text-sm text-popover-foreground">
              <BellOff className="mr-2 h-3.5 w-3.5" />
              {t("clearFollowUp")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onAssign(currentUserId ?? null)}
            disabled={!currentUserId}
            className="text-sm text-popover-foreground"
          >
            <UserPlus className="mr-2 h-3.5 w-3.5" />
            {t("assignToMe")}
          </DropdownMenuItem>
          {members
            .filter((m) => m.user_id !== currentUserId)
            .map((m) => (
              <DropdownMenuItem
                key={m.user_id}
                onClick={() => onAssign(m.user_id)}
                className="text-sm text-popover-foreground"
              >
                <Users className="mr-2 h-3.5 w-3.5" />
                {t("transferTo", { name: memberLabel(m) })}
              </DropdownMenuItem>
            ))}
          {conversation.assigned_agent_id && (
            <DropdownMenuItem onClick={() => onAssign(null)} className="text-sm text-muted-foreground">
              <UserRoundX className="mr-2 h-3.5 w-3.5" />
              {t("leaveQueue")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
