"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { CalendarDays, Loader2, MessageSquare, Search, Users } from "lucide-react"
import { useTranslations } from "next-intl"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import type { Contact, ConversationStatus, Message } from "@/types"

interface ConversationRow {
  id: string
  status: ConversationStatus
  created_at: string
  closed_at: string | null
  updated_at: string
  assigned_agent_id: string | null
}

interface ProfileRow {
  user_id: string
  full_name: string | null
  email: string | null
}

interface ConversationHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: Contact
}

type HistoryTab = "conversations" | "messages"

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return format(date, "dd/MM/yyyy HH:mm")
}

function inRange(
  value: string | null | undefined,
  from: string,
  to: string,
): boolean {
  if (!value) return true
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return true
  if (from) {
    const start = new Date(`${from}T00:00:00`)
    if (date < start) return false
  }
  if (to) {
    const end = new Date(`${to}T23:59:59.999`)
    if (date > end) return false
  }
  return true
}

export function ConversationHistoryModal({
  open,
  onOpenChange,
  contact,
}: ConversationHistoryModalProps) {
  const t = useTranslations("Inbox.history")
  const [tab, setTab] = useState<HistoryTab>("conversations")
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const supabase = createClient()
    setLoading(true)
    setSearch("")
    setFrom("")
    setTo("")
    setTab("conversations")

    void (async () => {
      const [conversationRes, profileRes] = await Promise.all([
        supabase
          .from("conversations")
          .select(
            "id, status, created_at, closed_at, updated_at, assigned_agent_id",
          )
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .order("full_name"),
      ])

      const conversationRows =
        (conversationRes.data as ConversationRow[] | null) ?? []
      let messageRows: Message[] = []
      if (conversationRows.length > 0) {
        const { data } = await supabase
          .from("messages")
          .select(
            "id, conversation_id, sender_type, sender_id, content_type, content_text, created_at, ai_generated",
          )
          .in(
            "conversation_id",
            conversationRows.map((conversation) => conversation.id),
          )
          .order("created_at", { ascending: false })
          .limit(1000)
        messageRows = (data as Message[] | null) ?? []
      }

      if (cancelled) return
      setConversations(conversationRows)
      setMessages(messageRows)
      setProfiles((profileRes.data as ProfileRow[] | null) ?? [])
      setLoading(false)
    })().catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [contact.id, open])
  /* eslint-enable react-hooks/set-state-in-effect */

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.user_id, profile])),
    [profiles],
  )
  const profileName = useCallback(
    (userId: string | null | undefined): string => {
      if (!userId) return t("unassigned")
      const profile = profileById.get(userId)
      return profile?.full_name || profile?.email || t("agent")
    },
    [profileById, t],
  )

  const messagesByConversation = useMemo(() => {
    const map = new Map<string, Message[]>()
    for (const message of messages) {
      const bucket = map.get(message.conversation_id) ?? []
      bucket.push(message)
      map.set(message.conversation_id, bucket)
    }
    return map
  }, [messages])

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return conversations.filter((conversation) => {
      const conversationMessages =
        messagesByConversation.get(conversation.id) ?? []
      if (!inRange(conversation.created_at, from, to)) return false
      if (!query) return true
      const responders = conversationMessages
        .filter((message) => message.sender_type === "agent" && message.sender_id)
        .map((message) => profileName(message.sender_id))
        .join(" ")
      return [
        formatDateTime(conversation.created_at),
        formatDateTime(conversation.closed_at),
        profileName(conversation.assigned_agent_id),
        responders,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    })
  }, [conversations, from, messagesByConversation, profileName, search, to])

  const filteredMessages = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return messages.filter((message) => {
      if (!inRange(message.created_at, from, to)) return false
      if (!query) return true
      return [
        message.content_text ?? "",
        message.sender_type,
        message.sender_id ? profileName(message.sender_id) : "",
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    })
  }, [from, messages, profileName, search, to])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[80vh] w-[80vw] max-w-[80vw] flex-col gap-0 overflow-hidden border-border bg-popover p-0 sm:max-w-[80vw]">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-popover-foreground">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {contact.name || contact.phone || contact.email}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 space-y-3 border-b border-border px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  tab === "messages"
                    ? t("searchMessages")
                    : t("searchConversations")
                }
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-36"
                aria-label={t("from")}
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-36"
                aria-label={t("to")}
              />
            </div>
          </div>

          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setTab("conversations")}
              className={
                tab === "conversations"
                  ? "rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                  : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {t("conversationsTab", { count: filteredConversations.length })}
            </button>
            <button
              type="button"
              onClick={() => setTab("messages")}
              className={
                tab === "messages"
                  ? "rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                  : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {t("messagesTab", { count: filteredMessages.length })}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : tab === "conversations" ? (
            filteredConversations.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t("noConversations")}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredConversations.map((conversation) => {
                  const conversationMessages =
                    messagesByConversation.get(conversation.id) ?? []
                  const responders = [
                    ...new Set(
                      conversationMessages
                        .filter(
                          (message) =>
                            message.sender_type === "agent" && message.sender_id,
                        )
                        .map((message) => profileName(message.sender_id)),
                    ),
                  ]
                  const closed =
                    conversation.status === "closed" ||
                    Boolean(conversation.closed_at)
                  return (
                    <div
                      key={conversation.id}
                      className="rounded-xl border border-border bg-card p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <MessageSquare className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {closed ? t("closed") : t("open")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {t("messagesCount", {
                                count: conversationMessages.length,
                              })}
                            </p>
                          </div>
                        </div>
                        <span
                          className={
                            closed
                              ? "rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                              : "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
                          }
                        >
                          {closed ? t("statusClosed") : t("statusOpen")}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <p>
                          {t("openedAt")}: {formatDateTime(conversation.created_at)}
                        </p>
                        <p>
                          {t("closedAt")}:{" "}
                          {closed
                            ? formatDateTime(
                                conversation.closed_at ?? conversation.updated_at,
                              )
                            : "—"}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Users className="h-3 w-3" />
                          {t("assignedTo")}:{" "}
                          {profileName(conversation.assigned_agent_id)}
                        </p>
                        <p>
                          {t("respondedBy")}:{" "}
                          {responders.length ? responders.join(", ") : "—"}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : filteredMessages.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("noMessages")}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredMessages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {message.sender_type === "customer"
                        ? t("customer")
                        : message.sender_type === "agent"
                          ? profileName(message.sender_id)
                          : message.ai_generated
                            ? t("ai")
                            : t("bot")}
                    </span>
                    <span>{formatDateTime(message.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                    {message.content_text || `[${message.content_type}]`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
