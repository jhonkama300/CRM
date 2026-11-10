"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { BarChart3, Loader2, RefreshCw, Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { zonedDayKey, zonedDayStart } from "@/lib/ai/usage-days"
import type { Channel } from "@/types"

type UsageRange = "today" | "7d" | "30d" | "month"

const COLOMBIA_TIME_ZONE = "America/Bogota"

interface UsageTotals {
  sent: number
  received: number
  delivered: number
  read: number
  failed: number
}

interface UsageCategories {
  marketing: number
  utility: number
  authentication: number
  service: number
  unknown: number
}

interface UsageDay extends UsageTotals, UsageCategories {
  date: string
}

interface UsageStats {
  totals: UsageTotals
  categories: UsageCategories
  categoryCosts: { marketing: number; utility: number; authentication: number; service: number }
  uniqueContacts24h: number
  daily: UsageDay[]
  costs: {
    available: boolean
    partial: boolean
    pricedMessages: number
    unpricedMessages: number
    currency: string
    estimatedTotalCop: number | null
    actualTotalCop: number | null
    reason: string | null
  }
}

interface UsageResponse {
  stats: UsageStats
  channel: Channel | null
  limit: number | null
  channels: Channel[]
}

interface ChannelUsageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: Channel | null
  canEdit: boolean
}

function shiftDayKey(dayKey: string, delta: number): string {
  const [year, month, day] = dayKey.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + delta))
    .toISOString()
    .slice(0, 10)
}

function rangeBounds(range: UsageRange): { from: Date; to: Date } {
  const now = new Date()
  const todayKey = zonedDayKey(now, COLOMBIA_TIME_ZONE)
  if (range === "today") {
    return { from: zonedDayStart(todayKey, COLOMBIA_TIME_ZONE), to: now }
  }
  if (range === "month") {
    const monthKey = `${todayKey.slice(0, 8)}01`
    return { from: zonedDayStart(monthKey, COLOMBIA_TIME_ZONE), to: now }
  }
  const days = range === "7d" ? 7 : 30
  const fromKey = shiftDayKey(todayKey, -(days - 1))
  return { from: zonedDayStart(fromKey, COLOMBIA_TIME_ZONE), to: now }
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}

export function ChannelUsageDialog({
  open,
  onOpenChange,
  channel,
  canEdit,
}: ChannelUsageDialogProps) {
  const t = useTranslations("Settings.channelUsage")
  const locale = useLocale()
  const [range, setRange] = useState<UsageRange>("7d")
  const [data, setData] = useState<UsageResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [pricingLoading, setPricingLoading] = useState(false)
  const [savingRates, setSavingRates] = useState(false)
  const [rates, setRates] = useState({
    marketing_rate: '0',
    utility_rate: '0',
    authentication_rate: '0',
    service_rate: '0',
  })

  const load = useCallback(async () => {
    const { from, to } = rangeBounds(range)
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    })
    if (channel?.id) params.set("channel_id", channel.id)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/channels/usage?${params}`, {
        cache: "no-store",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error ?? t("loadFailed"))
        return
      }
      setData(body as UsageResponse)
    } catch {
      setError(t("networkError"))
    } finally {
      setLoading(false)
    }
  }, [channel?.id, range, t])

  useEffect(() => {
    if (!open) return
    void load()
  }, [load, open])

  async function openPricing() {
    if (!channel) return
    setPricingLoading(true)
    try {
      const res = await fetch(
        `/api/channels/pricing?channel_id=${channel.id}`,
        { cache: "no-store" },
      )
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.rates) {
        setRates({
          marketing_rate: String(body.rates.marketing_rate ?? 0),
          utility_rate: String(body.rates.utility_rate ?? 0),
          authentication_rate: String(body.rates.authentication_rate ?? 0),
          service_rate: String(body.rates.service_rate ?? 0),
        })
      }
      setPricingOpen(true)
    } finally {
      setPricingLoading(false)
    }
  }

  async function savePricing() {
    if (!channel) return
    setSavingRates(true)
    try {
      const res = await fetch("/api/channels/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channel.id,
          marketing_rate: Number(rates.marketing_rate || 0),
          utility_rate: Number(rates.utility_rate || 0),
          authentication_rate: Number(rates.authentication_rate || 0),
          service_rate: Number(rates.service_rate || 0),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? t("pricingSaveFailed"))
        return
      }
      toast.success(t("pricingSaved"))
      setPricingOpen(false)
      await load()
    } catch {
      toast.error(t("networkError"))
    } finally {
      setSavingRates(false)
    }
  }

  const stats = data?.stats
  const limit = data?.limit ?? null
  const unique = stats?.uniqueContacts24h ?? 0
  const usedPercent =
    limit && limit > 0 ? Math.min(100, (unique / limit) * 100) : null
  const connectedChannels = useMemo(
    () => (data?.channels ?? []).filter((item) => item.status === "connected"),
    [data?.channels],
  )
  const totalCost = stats?.costs.available
    ? (stats.costs.actualTotalCop ?? stats.costs.estimatedTotalCop)
    : null
  const hasDaily = (stats?.daily.length ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[96vw] max-w-none flex-col gap-0 overflow-hidden border-border bg-background p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <DialogTitle className="text-base">
                  {channel ? t("title") : t("globalTitle")}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {channel
                    ? `${channel.name} · ${channel.display_phone_number || channel.phone_number_id}`
                    : t("globalDescription", {
                        count: connectedChannels.length,
                      })}
                </DialogDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["today", t("today")],
                  ["7d", t("last7")],
                  ["30d", t("last30")],
                  ["month", t("month")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRange(value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    range === value
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
              <span
                className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground"
                title={t("timeZoneHint")}
              >
                {t("timeZoneLabel")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void load()}
                disabled={loading}
                title={t("refresh")}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-5">
            {loading && !data ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
                {error}
              </div>
            ) : stats ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("limitTitle")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                      {formatNumber(unique, locale)}
                      {limit ? (
                        <span className="text-sm font-normal text-muted-foreground">
                          {" "}
                          / {formatNumber(limit, locale)}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {limit
                        ? t("limitUsed", {
                            percent:
                              usedPercent === null
                                ? "—"
                                : `${Math.round(usedPercent)}%`,
                          })
                        : t("limitUnavailable")}
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${usedPercent ?? 0}%` }}
                      />
                    </div>
                    <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                      {t("limitHint")}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("spendTitle")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                      {totalCost === null
                        ? "—"
                        : new Intl.NumberFormat(locale, {
                            style: "currency",
                            currency: stats.costs.currency || "COP",
                          }).format(totalCost)}
                    </p>
                    <div className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                      <p>
                        {t("estimated")}:{" "}
                        {stats.costs.estimatedTotalCop === null
                          ? "—"
                          : formatNumber(stats.costs.estimatedTotalCop, locale)}
                      </p>
                      <p>
                        {t("actualMeta")}:{" "}
                        {stats.costs.actualTotalCop === null
                          ? "—"
                          : formatNumber(stats.costs.actualTotalCop, locale)}
                      </p>
                    </div>
                    {!stats.costs.available ? (
                      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                        {t("noCostData")}
                      </p>
                    ) : stats.costs.partial ? (
                      <p className="mt-3 text-[10px] leading-relaxed text-amber-400">
                        {t("partialCost", { count: stats.costs.unpricedMessages })}
                      </p>
                    ) : null}
                    {channel && canEdit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void openPricing()}
                        disabled={pricingLoading}
                        className="mt-3 gap-1.5"
                      >
                        {pricingLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Settings2 className="h-3.5 w-3.5" />
                        )}
                        {t("configureRates")}
                      </Button>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("sentTitle")}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                      {formatNumber(stats.totals.sent, locale)}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span>{t("received")}: {formatNumber(stats.totals.received, locale)}</span>
                      <span>{t("delivered")}: {formatNumber(stats.totals.delivered, locale)}</span>
                      <span>{t("read")}: {formatNumber(stats.totals.read, locale)}</span>
                      <span>{t("failed")}: {formatNumber(stats.totals.failed, locale)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-medium text-foreground">
                      {t("dailyChart")}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {t("dailyChartHint")}
                    </p>
                    <div className="mt-3 h-56">
                      {hasDaily ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats.daily}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                            <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                            <Tooltip
                              contentStyle={{
                                background: "var(--popover)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                fontSize: 11,
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="sent" name={t("sent")} fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="received" name={t("received")} fill="#06b6d4" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                          {t("noData")}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-medium text-foreground">
                      {t("costChart")}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {t("costChartHint")}
                    </p>
                    <div className="mt-3 h-56">
                      {stats.costs.available ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              { name: t("marketing"), value: stats.categoryCosts.marketing },
                              { name: t("utility"), value: stats.categoryCosts.utility },
                              { name: t("authentication"), value: stats.categoryCosts.authentication },
                              { name: t("service"), value: stats.categoryCosts.service },
                            ]}
                          >
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                            <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                            <Tooltip />
                            <Bar dataKey="value" fill="#22c55e" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-4 text-center">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("costUnavailableTitle")}
                          </p>
                          <p className="max-w-xs text-[10px] leading-relaxed text-muted-foreground">
                            {t("noCostData")}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <p className="text-xs font-medium text-foreground">
                      {t("history")}
                    </p>
                    <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                      <span>{t("marketing")}: {formatNumber(stats.categories.marketing, locale)}</span>
                      <span>{t("utility")}: {formatNumber(stats.categories.utility, locale)}</span>
                      <span>{t("authentication")}: {formatNumber(stats.categories.authentication, locale)}</span>
                      <span>{t("service")}: {formatNumber(stats.categories.service, locale)}</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-[11px]">
                      <thead className="border-b border-border text-[9px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2">{t("date")}</th>
                          <th className="px-3 py-2">{t("sent")}</th>
                          <th className="px-3 py-2">{t("received")}</th>
                          <th className="px-3 py-2">{t("delivered")}</th>
                          <th className="px-3 py-2">{t("read")}</th>
                          <th className="px-3 py-2">{t("failed")}</th>
                          <th className="px-3 py-2">{t("marketing")}</th>
                          <th className="px-3 py-2">{t("utility")}</th>
                          <th className="px-3 py-2">{t("authentication")}</th>
                          <th className="px-3 py-2">{t("service")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.daily.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                              {t("noData")}
                            </td>
                          </tr>
                        ) : (
                          [...stats.daily].reverse().map((day) => (
                            <tr key={day.date} className="border-b border-border/70 last:border-0">
                              <td className="px-4 py-2 tabular-nums text-foreground">{day.date}</td>
                              <td className="px-3 py-2 tabular-nums">{day.sent}</td>
                              <td className="px-3 py-2 tabular-nums">{day.received}</td>
                              <td className="px-3 py-2 tabular-nums">{day.delivered}</td>
                              <td className="px-3 py-2 tabular-nums">{day.read}</td>
                              <td className="px-3 py-2 tabular-nums">{day.failed}</td>
                              <td className="px-3 py-2 tabular-nums">{day.marketing}</td>
                              <td className="px-3 py-2 tabular-nums">{day.utility}</td>
                              <td className="px-3 py-2 tabular-nums">{day.authentication}</td>
                              <td className="px-3 py-2 tabular-nums">{day.service}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </ScrollArea>

        <Dialog open={pricingOpen} onOpenChange={setPricingOpen}>
          <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("configureRates")}</DialogTitle>
              <DialogDescription>
                {t("ratesDescription", { name: channel?.name ?? "" })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              {(
                [
                  ["marketing_rate", t("marketing")],
                  ["utility_rate", t("utility")],
                  ["authentication_rate", t("authentication")],
                  ["service_rate", t("service")],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={rates[field]}
                    onChange={(event) =>
                      setRates((prev) => ({
                        ...prev,
                        [field]: event.target.value,
                      }))
                    }
                    className="bg-muted text-foreground"
                  />
                </div>
              ))}
              <p className="text-muted-foreground text-[10px] sm:col-span-2">
                {t("ratesCurrencyHint")}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPricingOpen(false)}
                disabled={savingRates}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void savePricing()}
                disabled={savingRates}
              >
                {savingRates ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                {t("saveRates")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
