'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import type { QualityRating, PhoneHealth } from '@/lib/whatsapp/phone-health';
import { cn } from '@/lib/utils';

type Health = PhoneHealth & { channelCount?: number };

const QUALITY_ORDER: QualityRating[] = ['UNKNOWN', 'GREEN', 'YELLOW', 'RED'];

function worstQuality(values: Array<string | null>): QualityRating {
  let worst: QualityRating = 'UNKNOWN';
  for (const value of values) {
    const quality = (value ?? 'UNKNOWN').toUpperCase() as QualityRating;
    if (QUALITY_ORDER.indexOf(quality) > QUALITY_ORDER.indexOf(worst)) {
      worst = quality;
    }
  }
  return worst;
}

const DOT_CLASS = {
  GREEN: 'bg-status-good',
  YELLOW: 'bg-status-warning',
  RED: 'bg-status-critical',
  UNKNOWN: 'bg-muted-foreground/60',
} as const;

export function WhatsAppHealthChip() {
  const t = useTranslations('Dashboard.overview.health');
  const format = useFormatter();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: channels } = await createClient()
        .from('channels')
        .select('status, quality_rating, display_phone_number')
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (channels && channels.length > 0) {
        setHealth({
          state: channels.some((channel) => channel.status === 'connected')
            ? 'connected'
            : 'disconnected',
          displayPhoneNumber:
            channels.length === 1 ? channels[0].display_phone_number : null,
          quality: worstQuality(
            channels.map((channel) => channel.quality_rating)
          ),
          limit: null,
          channelCount: channels.length,
        });
        return;
      }

      // Deployments that have not created a channel yet still fall back
      // to the legacy single-number health endpoint.
      const res = await fetch('/api/whatsapp/health');
      const body = res.ok ? ((await res.json()) as Health) : null;
      if (!cancelled && body) setHealth(body);
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!health) return null;

  const limit =
    health.limit?.kind === 'unlimited'
      ? t('unlimited')
      : health.limit
        ? t('perDay', {
            count: format.number(health.limit.perDay, { notation: 'compact' }),
          })
        : null;

  const numberLabel =
    (health.channelCount ?? 0) > 1
      ? t('channels', { count: health.channelCount ?? 0 })
      : health.displayPhoneNumber;

  const label =
    health.state === 'disconnected'
      ? t('disconnected')
      : health.state === 'unavailable'
        ? t('unavailable')
        : [numberLabel, t(`quality.${health.quality}`), limit]
            .filter(Boolean)
            .join(' · ');

  const dot =
    health.state === 'connected'
      ? DOT_CLASS[health.quality]
      : health.state === 'disconnected'
        ? DOT_CLASS.RED
        : DOT_CLASS.UNKNOWN;

  return (
    <Link
      href="/settings?tab=channels"
      title={t('title')}
      className="border-border bg-card text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-8 max-w-full items-center gap-2 rounded-lg border px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}
