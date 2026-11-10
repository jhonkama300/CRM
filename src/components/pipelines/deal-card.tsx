"use client"

import { useEffect, useMemo, useState } from "react"
import type { Deal, PipelineStage } from "@/types"
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock3,
  GripVertical,
  MessageCircle,
  X,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface DealCardProps {
  deal: Deal
  stage: PipelineStage | null
  onEdit: (deal: Deal) => void
  onOpenChat?: (deal: Deal) => void
  isOverlay?: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const STALLED_DAYS = 7

function initials(name?: string, fallback?: string) {
  const source = (name || fallback || "?").trim()
  if (!source) return "?"
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

export function DealCard({
  deal,
  stage,
  onEdit,
  onOpenChat,
  isOverlay,
}: DealCardProps) {
  const t = useTranslations("Pipelines.card")
  const locale = useLocale()
  const [now, setNow] = useState(0)
  const contactLabel =
    deal.contact?.name || deal.contact?.phone || t("noContact")
  const assigneeLabel = deal.assignee?.full_name || null
  const updatedAt = deal.updated_at ?? deal.created_at

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const relative = useMemo(() => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
    return (value: string) => {
      const current = now || new Date(value).getTime()
      const diffMs = new Date(value).getTime() - current
      const absMs = Math.abs(diffMs)
      if (absMs < 60 * 60 * 1000) {
        return rtf.format(Math.round(diffMs / (60 * 1000)), "minute")
      }
      if (absMs < DAY_MS) {
        return rtf.format(Math.round(diffMs / (60 * 60 * 1000)), "hour")
      }
      return rtf.format(Math.round(diffMs / DAY_MS), "day")
    }
  }, [locale, now])

  const closeDate = useMemo(() => {
    if (!deal.expected_close_date) return null
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
    }).format(new Date(deal.expected_close_date))
  }, [deal.expected_close_date, locale])

  const ageDays = now
    ? (now - new Date(updatedAt).getTime()) / DAY_MS
    : 0
  const stalled =
    deal.status !== "won" && deal.status !== "lost" && ageDays >= STALLED_DAYS

  return (
    <div
      role="button"
      tabIndex={isOverlay ? -1 : 0}
      onClick={(e) => {
        if (isOverlay) return
        e.stopPropagation()
        onEdit(deal)
      }}
      onKeyDown={(e) => {
        if (isOverlay) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onEdit(deal)
        }
      }}
      className={cn(
        "group relative w-full cursor-pointer overflow-hidden rounded-lg border border-border/80 bg-card text-left transition-colors",
        isOverlay ? "shadow-xl" : "hover:border-foreground/20",
      )}
    >
      <div className="p-3">
        <div className="flex items-start gap-1.5">
          <span
            aria-hidden
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: stage?.color ?? "#94a3b8",
              boxShadow: `0 0 0 2px ${(stage?.color ?? "#94a3b8")}22`,
            }}
          />
          <h4 className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-foreground break-words">
            {deal.title}
          </h4>
          <GripVertical
            aria-hidden
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Avatar className="size-6 shrink-0">
            {deal.contact?.avatar_url ? (
              <AvatarImage
                src={deal.contact.avatar_url}
                alt={contactLabel}
              />
            ) : null}
            <AvatarFallback className="bg-muted text-[9px] font-semibold text-foreground">
              {initials(deal.contact?.name, deal.contact?.phone)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-foreground">
              {contactLabel}
            </p>
            {deal.contact?.name && deal.contact.phone ? (
              <p className="truncate text-[9.5px] text-muted-foreground">
                {deal.contact.phone}
              </p>
            ) : deal.contact?.company ? (
              <p className="truncate text-[9.5px] text-muted-foreground">
                {deal.contact.company}
              </p>
            ) : null}
          </div>
        </div>

        {(deal.status === "won" || deal.status === "lost" || stalled) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {deal.status === "won" && (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                <Check className="h-3 w-3" />
                {t("won")}
              </span>
            )}
            {deal.status === "lost" && (
              <span className="inline-flex items-center gap-1 rounded border border-rose-500/25 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-400">
                <X className="h-3 w-3" />
                {t("lost")}
              </span>
            )}
            {stalled && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {t("stalled")}
              </span>
            )}
          </div>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
          <span className="inline-flex min-w-0 items-center gap-1 text-[9.5px] text-muted-foreground">
            <Clock3 className="h-3 w-3 shrink-0" />
            <span className="truncate">{relative(updatedAt)}</span>
          </span>

          <div className="flex shrink-0 items-center gap-1.5">
            {closeDate && (
              <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                <Calendar className="h-2.5 w-2.5" />
                {closeDate}
              </span>
            )}
            {assigneeLabel && (
              <Avatar className="size-5" title={assigneeLabel}>
                {deal.assignee?.avatar_url ? (
                  <AvatarImage
                    src={deal.assignee.avatar_url}
                    alt={assigneeLabel}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/15 text-[8px] font-semibold text-primary">
                  {initials(assigneeLabel)}
                </AvatarFallback>
              </Avatar>
            )}
            {onOpenChat && !isOverlay ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenChat(deal)
                }}
                title={t("openChat")}
                aria-label={t("openChat")}
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-card text-muted-foreground transition-all hover:border-primary/40 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
