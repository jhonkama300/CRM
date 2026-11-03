"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, MessageSquare, Search, Zap } from "lucide-react"
import { useTranslations } from "next-intl"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { QuickReply } from "@/types"
import { interactivePayloadPreviewText } from "@/lib/whatsapp/interactive"

interface QuickReplyPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (qr: QuickReply) => void
}

export function QuickReplyPicker({
  open,
  onOpenChange,
  onPick,
}: QuickReplyPickerProps) {
  const t = useTranslations("Inbox.composer")
  const [items, setItems] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSearch("")
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch("/api/quick-replies", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) {
          setItems((data.quick_replies as QuickReply[]) ?? [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return items
    return items.filter((item) => {
      const preview =
        item.kind === "interactive" && item.interactive_payload
          ? interactivePayloadPreviewText(item.interactive_payload)
          : item.content_text
      return [item.title, preview ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    })
  }, [items, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("quickReplies")}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchQuickReplies")}
            autoFocus
            className="mb-3 pl-9"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("quickRepliesEmpty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filteredItems.map((qr) => (
                <li key={qr.id}>
                  <button
                    type="button"
                    onClick={() => onPick(qr)}
                    className="flex w-full items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-left hover:border-primary/50 hover:bg-muted"
                  >
                    {qr.kind === "interactive" ? (
                      <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {qr.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {qr.kind === "interactive" && qr.interactive_payload
                          ? interactivePayloadPreviewText(qr.interactive_payload)
                          : qr.content_text}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
