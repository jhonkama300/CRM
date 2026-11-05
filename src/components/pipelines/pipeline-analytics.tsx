"use client"

import { useMemo } from "react"
import type { Deal } from "@/types"
import { Info, Layers3, Target, Trophy, XCircle } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

interface PipelineAnalyticsProps {
  deals: Deal[]
}

const TONES = {
  violet: {
    icon: "bg-primary/10 text-primary",
    bar: "bg-primary",
  },
  emerald: {
    icon: "bg-emerald-500/10 text-emerald-400",
    bar: "bg-emerald-500",
  },
  rose: {
    icon: "bg-rose-500/10 text-rose-400",
    bar: "bg-rose-500",
  },
  cyan: {
    icon: "bg-cyan-500/10 text-cyan-400",
    bar: "bg-cyan-500",
  },
} as const

export function PipelineAnalytics({ deals }: PipelineAnalyticsProps) {
  const t = useTranslations("Pipelines.analytics")

  const stats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonth = (deal: Deal) => {
      const ts = deal.updated_at ?? deal.created_at
      return ts ? new Date(ts) >= monthStart : false
    }
    const open = deals.filter(
      (deal) => deal.status !== "won" && deal.status !== "lost",
    ).length
    const won = deals.filter(
      (deal) => deal.status === "won" && thisMonth(deal),
    ).length
    const lost = deals.filter(
      (deal) => deal.status === "lost" && thisMonth(deal),
    ).length
    const closed = won + lost
    const conversion = closed > 0 ? (won / closed) * 100 : 0

    return {
      open,
      total: deals.length,
      won,
      lost,
      closed,
      conversion,
    }
  }, [deals])

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          icon={<Layers3 className="h-4 w-4" />}
          label={t("openDeals")}
          value={String(stats.open)}
          detail={t("ofTotal", { count: stats.total })}
          progress={stats.total > 0 ? (stats.open / stats.total) * 100 : 0}
          tooltip={t("openDealsTooltip")}
          tone="violet"
          t={t}
        />
        <Metric
          icon={<Trophy className="h-4 w-4" />}
          label={t("wonThisMonth")}
          value={String(stats.won)}
          detail={t("thisMonth")}
          progress={
            stats.closed > 0 ? (stats.won / stats.closed) * 100 : 0
          }
          tooltip={t("wonThisMonthTooltip")}
          tone="emerald"
          t={t}
        />
        <Metric
          icon={<XCircle className="h-4 w-4" />}
          label={t("lostThisMonth")}
          value={String(stats.lost)}
          detail={t("thisMonth")}
          progress={
            stats.closed > 0 ? (stats.lost / stats.closed) * 100 : 0
          }
          tooltip={t("lostThisMonthTooltip")}
          tone="rose"
          t={t}
        />
        <Metric
          icon={<Target className="h-4 w-4" />}
          label={t("conversionRate")}
          value={stats.closed > 0 ? `${Math.round(stats.conversion)}%` : "—"}
          detail={
            stats.closed > 0
              ? t("wonVsLost", { won: stats.won, lost: stats.lost })
              : t("noClosedDeals")
          }
          progress={stats.conversion}
          tooltip={t("conversionRateTooltip")}
          tone="cyan"
          t={t}
        />
      </div>
    </TooltipProvider>
  )
}

function Metric({
  icon,
  label,
  value,
  detail,
  progress,
  tooltip,
  tone,
  t,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  progress: number
  tooltip: string
  tone: keyof typeof TONES
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  const toneClass = TONES[tone]

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            toneClass.icon,
          )}
        >
          {icon}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t("howCalculated", { label })}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              />
            }
          >
            <Info className="h-3.5 w-3.5" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </p>
        <p className="text-[10px] text-muted-foreground">{detail}</p>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", toneClass.bar)}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  )
}
