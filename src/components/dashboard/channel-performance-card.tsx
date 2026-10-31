'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowDownLeft, ArrowUpRight, Download, TriangleAlert } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import type { OverviewRange } from '@/lib/dashboard/overview'

interface ChannelPerformance {
  channel_id: string
  name: string
  color: string
  status: string
  display_phone_number: string | null
  quality_rating: string | null
  conversations: number
  open_conversations: number
  inbound: number
  outbound: number
  failed: number
}

const QUALITY_CLASS: Record<string, string> = {
  GREEN: 'bg-status-good',
  YELLOW: 'bg-status-warning',
  RED: 'bg-status-critical',
}

export function ChannelPerformanceCard({
  days,
  channelId,
}: {
  days: OverviewRange
  channelId: string | null
}) {
  const t = useTranslations('Dashboard.channels')
  const format = useFormatter()
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<ChannelPerformance[] | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('channel_performance', { p_days: days })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[dashboard] channel performance failed:', error.message)
          setRows([])
          return
        }
        setRows((data ?? []) as ChannelPerformance[])
      })
    return () => {
      cancelled = true
    }
  }, [supabase, days])

  const visibleRows = channelId
    ? (rows ?? []).filter((row) => row.channel_id === channelId)
    : (rows ?? [])

  const exportCsv = () => {
    if (visibleRows.length === 0) return
    const header = [
      t('csv.channel'),
      t('csv.phone'),
      t('csv.quality'),
      t('csv.conversations'),
      t('csv.open'),
      t('csv.inbound'),
      t('csv.outbound'),
      t('csv.failed'),
    ]
    const escape = (value: string | number | null) => {
      const text = String(value ?? '')
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }
    const body = visibleRows.map((row) =>
      [
        row.name,
        row.display_phone_number ?? '',
        row.quality_rating ?? 'UNKNOWN',
        row.conversations,
        row.open_conversations,
        row.inbound,
        row.outbound,
        row.failed,
      ]
        .map(escape)
        .join(','),
    )
    const csv = [header.map(escape).join(','), ...body].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `channel-performance-${days}d.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (visibleRows.length === 0) return null

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Download className="size-3.5" aria-hidden />
            {t('exportCsv')}
          </button>
          <Link
            href="/settings?tab=channels"
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('manage')}
          </Link>
        </div>
      </div>
      <div className="divide-y divide-border">
        {visibleRows.map((row) => (
          <div
            key={row.channel_id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                <span
                  className={`size-1.5 rounded-full ${QUALITY_CLASS[row.quality_rating ?? ''] ?? 'bg-muted-foreground/60'}`}
                  title={`${t('quality')}: ${row.quality_rating ?? 'UNKNOWN'}`}
                />
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {row.display_phone_number ?? row.status}
              </p>
            </div>
            <dl className="flex flex-wrap items-center gap-4 text-xs">
              <div className="text-center">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('conversations')}
                </dt>
                <dd className="font-semibold text-foreground">
                  {format.number(row.conversations)}
                </dd>
              </div>
              <div className="text-center">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('open')}
                </dt>
                <dd className="font-semibold text-foreground">
                  {format.number(row.open_conversations)}
                </dd>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <ArrowDownLeft className="size-3.5 text-emerald-500" aria-hidden />
                {format.number(row.inbound)}
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <ArrowUpRight className="size-3.5 text-blue-500" aria-hidden />
                {format.number(row.outbound)}
              </div>
              {row.failed > 0 && (
                <div className="flex items-center gap-1 text-status-critical">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {format.number(row.failed)}
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
    </section>
  )
}
