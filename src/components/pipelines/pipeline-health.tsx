"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Activity, AlertTriangle, Clock3, Layers3 } from "lucide-react"

import type { Deal, PipelineStage } from "@/types"

interface PipelineHealthProps {
  deals: Deal[]
  stages: PipelineStage[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const STALLED_DAYS = 7

function stageOf(deal: Deal, stages: PipelineStage[]) {
  return stages.find((stage) => stage.id === deal.stage_id) ?? null
}

function ageInDays(deal: Deal, now: number) {
  const ts = new Date(deal.updated_at ?? deal.created_at).getTime()
  return Math.max(0, (now - ts) / DAY_MS)
}

export function PipelineHealth({ deals, stages }: PipelineHealthProps) {
  const t = useTranslations("Pipelines.health")
  const locale = useLocale()
  const [now, setNow] = useState(0)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const health = useMemo(() => {
    const current = now || 0
    const sortedStages = [...stages].sort((a, b) => a.position - b.position)
    const openDeals = deals.filter(
      (deal) => deal.status !== "won" && deal.status !== "lost",
    )

    const stageRows = sortedStages.map((stage) => {
      const count = openDeals.filter((deal) => deal.stage_id === stage.id).length
      return { stage, count }
    })
    const maxStageCount = Math.max(1, ...stageRows.map((row) => row.count))

    const stalled = openDeals.filter(
      (deal) => ageInDays(deal, now) >= STALLED_DAYS,
    )
    const oldest = [...openDeals].sort(
      (a, b) =>
        new Date(a.updated_at ?? a.created_at).getTime() -
        new Date(b.updated_at ?? b.created_at).getTime(),
    )[0]

    const avgAge =
      openDeals.length > 0
        ? openDeals.reduce((sum, deal) => sum + ageInDays(deal, current), 0) /
          openDeals.length
        : 0

    return {
      openCount: openDeals.length,
      stageRows,
      maxStageCount,
      stalledCount: stalled.length,
      oldest,
      avgAge,
    }
  }, [deals, stages, now])

  const rtf = useMemo(
    () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
    [locale],
  )

  function relativeTime(value: string | undefined) {
    if (!value) return ""
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

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-2.5 border-b border-border p-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Activity className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t("title")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <span className="ml-auto rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {t("openDeals", { count: health.openCount })}
        </span>
      </div>

      <div className="flex-1 space-y-5 p-4">
        <section>
          <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Layers3 className="h-3.5 w-3.5" />
            {t("stageDistribution")}
          </div>
          {health.openCount === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-2.5 py-3 text-[11px] text-muted-foreground">
              {t("noDeals")}
            </p>
          ) : (
            <div className="space-y-2.5">
              {health.stageRows.map(({ stage, count }) => (
                <div key={stage.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                      {stage.name}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / health.maxStageCount) * 100}%`,
                        backgroundColor: stage.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{t("stalled")}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("stalledDesc", { days: STALLED_DAYS })}
              </p>
            </div>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-400">
              {health.stalledCount}
            </span>
          </div>
          {health.stalledCount === 0 ? (
            <p className="mt-2 text-[10px] text-emerald-400">{t("noStalled")}</p>
          ) : null}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {t("oldest")}
          </div>
          {health.oldest ? (
            <div className="rounded-lg border border-border bg-muted/30 p-2.5">
              <p className="line-clamp-2 text-xs font-medium text-foreground">
                {health.oldest.title}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {stageOf(health.oldest, stages)?.name ?? "—"} ·{" "}
                {relativeTime(
                  health.oldest.updated_at ?? health.oldest.created_at,
                )}
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-2.5 py-3 text-[11px] text-muted-foreground">
              {t("noDeals")}
            </p>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2 border-t border-border pt-4">
          <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground">{t("avgAge")}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {t("days", { count: Math.round(health.avgAge) })}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
            <p className="text-[10px] text-muted-foreground">{t("openLabel")}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {health.openCount}
            </p>
          </div>
        </section>
      </div>
    </aside>
  )
}
