"use client"

import { useMemo } from "react"
import type { Deal } from "@/types"
import { Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTranslations } from "next-intl"

interface PipelineAnalyticsProps {
  deals: Deal[]
}

const TONES = {
  violet: "bg-primary",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  cyan: "bg-cyan-500",
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
      <div className="grid grid-cols-2 divide-y divide-border border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <Metric
          label={t("openDeals")}
          value={String(stats.open)}
          detail={t("ofTotal", { count: stats.total })}
          tooltip={t("openDealsTooltip")}
          tone="violet"
          t={t}
        />
        <Metric
          label={t("wonThisMonth")}
          value={String(stats.won)}
          detail={t("thisMonth")}
          tooltip={t("wonThisMonthTooltip")}
          tone="emerald"
          t={t}
        />
        <Metric
          label={t("lostThisMonth")}
          value={String(stats.lost)}
          detail={t("thisMonth")}
          tooltip={t("lostThisMonthTooltip")}
          tone="rose"
          t={t}
        />
        <Metric
          label={t("conversionRate")}
          value={stats.closed > 0 ? `${Math.round(stats.conversion)}%` : "—"}
          detail={
            stats.closed > 0
              ? t("wonVsLost", { won: stats.won, lost: stats.lost })
              : t("noClosedDeals")
          }
          tooltip={t("conversionRateTooltip")}
          tone="cyan"
          t={t}
        />
      </div>
    </TooltipProvider>
  )
}

function Metric({
  label,
  value,
  detail,
  tooltip,
  tone,
  t,
}: {
  label: string
  value: string
  detail: string
  tooltip: string
  tone: keyof typeof TONES
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
}) {
  return (
    <div className="px-3 py-3.5 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONES[tone]}`} />
          <span className="truncate">{label}</span>
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
            <Info className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-left">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1.5 text-[10px] text-muted-foreground">{detail}</p>
    </div>
  )
}
