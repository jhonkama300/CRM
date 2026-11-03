"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  Calendar,
  Check,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  StickyNote,
  UserRound,
  X,
} from "lucide-react"
import { useTranslations } from "next-intl"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DealChatDialog } from "./deal-chat-dialog"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import type {
  Contact,
  ContactNote,
  Conversation,
  Deal,
  Message,
  Pipeline,
  PipelineStage,
} from "@/types"

interface DealDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  deal: Deal | null
  pipeline: Pipeline | undefined
  stages: PipelineStage[]
  onEdit: (deal: Deal) => void
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString()
}

export function DealDetailSheet({
  open,
  onOpenChange,
  deal,
  pipeline,
  stages,
  onEdit,
}: DealDetailSheetProps) {
  const t = useTranslations("Pipelines.detail")
  const supabase = useMemo(() => createClient(), [])
  const [contact, setContact] = useState<Contact | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [notes, setNotes] = useState<ContactNote[]>([])
  const [loading, setLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const stage =
    stages.find((item) => item.id === deal?.stage_id) ?? deal?.stage ?? null

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !deal) return
    let cancelled = false
    setLoading(true)
    setContact(deal.contact ?? null)
    setConversation(null)
    setMessages([])
    setNotes([])

    ;(async () => {
      let contactRow = deal.contact ?? null
      if (!contactRow && deal.contact_id) {
        const { data } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", deal.contact_id)
          .maybeSingle()
        contactRow = (data as Contact | null) ?? null
      }

      let conversationRow: Conversation | null = null
      if (deal.conversation_id) {
        const { data } = await supabase
          .from("conversations")
          .select("*, channel:channels(id,name,color)")
          .eq("id", deal.conversation_id)
          .maybeSingle()
        conversationRow = (data as Conversation | null) ?? null
      } else if (deal.contact_id) {
        const { data } = await supabase
          .from("conversations")
          .select("*, channel:channels(id,name,color)")
          .eq("contact_id", deal.contact_id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        conversationRow = (data as Conversation | null) ?? null
      }

      let messageRows: Message[] = []
      if (conversationRow) {
        const { data } = await supabase
          .from("messages")
          .select("id, sender_type, content_type, content_text, created_at")
          .eq("conversation_id", conversationRow.id)
          .order("created_at", { ascending: false })
          .limit(20)
        messageRows = ((data as Message[] | null) ?? []).reverse()
      }

      let noteRows: ContactNote[] = []
      if (deal.contact_id) {
        const { data } = await supabase
          .from("contact_notes")
          .select("*")
          .eq("contact_id", deal.contact_id)
          .order("created_at", { ascending: false })
          .limit(5)
        noteRows = (data as ContactNote[] | null) ?? []
      }

      if (cancelled) return
      setContact(contactRow)
      setConversation(conversationRow)
      setMessages(messageRows)
      setNotes(noteRows)
      setLoading(false)
    })().catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [deal, open, supabase])
  /* eslint-enable react-hooks/set-state-in-effect */

  const contactName =
    contact?.name || contact?.phone || contact?.email || t("noContact")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[80vh] w-[80vw] max-w-[80vw] sm:max-w-[80vw] flex-col overflow-hidden border-border bg-popover p-0">
        {deal ? (
          <>
            <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="truncate text-lg text-popover-foreground">
                      {deal.title}
                    </DialogTitle>
                    {deal.status === "won" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Check className="h-3 w-3" />
                        {t("won")}
                      </span>
                    )}
                    {deal.status === "lost" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                        <X className="h-3 w-3" />
                        {t("lost")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("createdAt")}: {formatDate(deal.created_at)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {conversation && (
                  <Button
                    size="sm"
                    onClick={() => setChatOpen(true)}
                    className="gap-1.5"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {t("openChat")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(deal)}
                  className="gap-1.5"
                >
                  <Pencil className="h-4 w-4" />
                  {t("edit")}
                </Button>
              </div>
            </DialogHeader>

            <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-6 lg:grid-cols-2">
              <div className="grid grid-cols-2 gap-3">
                <InfoCard
                  label={t("stage")}
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
                      />
                      {stage?.name ?? "—"}
                    </span>
                  }
                />
                <InfoCard
                  label={t("pipeline")}
                  value={pipeline?.name ?? "—"}
                />
                <InfoCard
                  label={t("expectedClose")}
                  value={formatDate(deal.expected_close_date)}
                  icon={<Calendar className="h-3.5 w-3.5" />}
                />
                <InfoCard
                  label={t("assignee")}
                  value={deal.assignee?.full_name || t("unassigned")}
                  icon={<UserRound className="h-3.5 w-3.5" />}
                />
              </div>

              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  {t("contact")}
                </h3>
                <div className="mt-3 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {initials(contactName)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {contactName}
                    </p>
                    {contact?.phone && (
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {contact.phone}
                      </p>
                    )}
                    {contact?.email && (
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </p>
                    )}
                    {contact?.company && (
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {contact.company}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {deal.notes && (
                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t("notes")}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {deal.notes}
                  </p>
                </section>
              )}

              <section className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    {t("conversation")}
                  </h3>
                  {conversation && (
                    <button
                      type="button"
                      onClick={() => setChatOpen(true)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:opacity-80"
                    >
                      {t("openChat")}
                    </button>
                  )}
                </div>
                {conversation ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5">
                        <MessageSquare className="h-3 w-3" />
                        {conversation.channel?.name ?? t("whatsapp")}
                      </span>
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5">
                        {conversation.status}
                      </span>
                      <span>{formatDate(conversation.last_message_at)}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {loading ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      ) : messages.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t("noMessages")}
                        </p>
                      ) : (
                        messages.map((message) => (
                          <div
                            key={message.id}
                            className="rounded-lg border border-border bg-muted/30 px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                              <span className="font-medium uppercase tracking-wide">
                                {message.sender_type === "customer"
                                  ? t("customer")
                                  : message.sender_type === "agent"
                                    ? t("agent")
                                    : t("bot")}
                              </span>
                              <span>{formatDate(message.created_at)}</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-foreground">
                              {message.content_text || `[${message.content_type}]`}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("noConversation")}
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  {t("recentNotes")}
                </h3>
                {notes.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("noNotes")}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-lg border border-border bg-muted/30 px-3 py-2"
                      >
                        <p className="whitespace-pre-wrap text-xs text-foreground">
                          {note.note_text}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {formatDate(note.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}
        <DealChatDialog
          open={chatOpen}
          onOpenChange={setChatOpen}
          conversation={conversation}
          contact={contact}
        />
      </DialogContent>
    </Dialog>
  )
}

function InfoCard({
  label,
  value,
  icon,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <div className="mt-1.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}
