"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MessageThread } from "@/components/inbox/message-thread"
import type {
  Contact,
  Conversation,
  ConversationStatus,
  Message,
} from "@/types"

interface DealChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversation: Conversation | null
  contact: Contact | null
}

export function DealChatDialog({
  open,
  onOpenChange,
  conversation,
  contact,
}: DealChatDialogProps) {
  const t = useTranslations("Pipelines.chat")

  if (!conversation) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="z-[70] flex h-[80vh] max-h-[80vh] w-[80vw] max-w-[80vw] flex-col overflow-hidden border-border bg-popover p-0 sm:max-w-[80vw]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("whatsapp")}</DialogTitle>
        </DialogHeader>
        <DealChatContent
          key={conversation.id}
          conversation={conversation}
          contact={contact}
        />
      </DialogContent>
    </Dialog>
  )
}

function DealChatContent({
  conversation,
  contact,
}: {
  conversation: Conversation
  contact: Contact | null
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [activeConversation, setActiveConversation] =
    useState<Conversation>(conversation)
  const [resyncToken, setResyncToken] = useState(0)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MessageThread
        conversation={activeConversation}
        contact={contact}
        messages={messages}
        onMessagesLoaded={(rows, conversationId) => {
          if (conversationId === conversation.id) setMessages(rows)
        }}
        onOlderMessagesLoaded={(rows) => {
          setMessages((prev) => {
            const known = new Set(prev.map((message) => message.id))
            return [
              ...rows.filter((message) => !known.has(message.id)),
              ...prev,
            ]
          })
        }}
        onNewMessage={(message) => {
          setMessages((prev) =>
            prev.some((row) => row.id === message.id)
              ? prev
              : [...prev, message],
          )
        }}
        onUpdateMessage={(id, updates) => {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === id ? { ...message, ...updates } : message,
            ),
          )
        }}
        onRemoveMessage={(id) => {
          setMessages((prev) =>
            prev.filter((message) => message.id !== id),
          )
        }}
        onStatusChange={(_, status: ConversationStatus) => {
          setActiveConversation((prev) => ({ ...prev, status }))
        }}
        onAssignChange={(_, assignedAgentId) => {
          setActiveConversation((prev) => ({
            ...prev,
            assigned_agent_id: assignedAgentId,
          }))
        }}
        resyncToken={resyncToken}
        onRefresh={() => setResyncToken((value) => value + 1)}
      />
    </div>
  )
}
