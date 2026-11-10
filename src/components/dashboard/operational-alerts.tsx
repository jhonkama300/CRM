'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Sparkles,
  XCircle,
} from 'lucide-react';

interface Health {
  whatsapp: {
    configured: boolean;
    connected: boolean;
    channels: number;
    failed: number;
  };
  ai: { configured: boolean; active: boolean; autoReply: boolean };
  cron: { configured: boolean };
  channels: Array<{
    id: string;
    name: string;
    status: string;
    display_phone_number: string | null;
    quality_rating: string | null;
    registered_at: string | null;
    last_checked_at: string | null;
    last_error: string | null;
  }>;
}

interface Alert {
  id: string;
  tone: 'critical' | 'warning';
  icon: typeof AlertTriangle;
  title: string;
  detail: string;
  href: string;
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function OperationalAlerts() {
  const t = useTranslations('Dashboard.alerts');
  const [health, setHealth] = useState<Health | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health/operational', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body) setHealth(body as Health);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!health) return null;

  const alerts: Alert[] = [];
  if (!health.whatsapp.configured) {
    alerts.push({
      id: 'whatsapp-missing',
      tone: 'critical',
      icon: MessageCircle,
      title: t('whatsappMissingTitle'),
      detail: t('whatsappMissingDetail'),
      href: '/settings?tab=channels',
    });
  } else if (!health.whatsapp.connected || health.whatsapp.failed > 0) {
    alerts.push({
      id: 'whatsapp-down',
      tone: 'critical',
      icon: XCircle,
      title: t('whatsappDownTitle'),
      detail: t('whatsappDownDetail', { count: health.whatsapp.failed }),
      href: '/settings?tab=channels',
    });
  }

  const red = health.channels.filter((c) => c.quality_rating === 'RED');
  if (red.length > 0) {
    alerts.push({
      id: 'quality-red',
      tone: 'critical',
      icon: AlertTriangle,
      title: t('qualityTitle'),
      detail: red.map((c) => c.name).join(', '),
      href: '/settings?tab=channels',
    });
  }

  const unregistered = health.channels.filter((c) => !c.registered_at);
  if (unregistered.length > 0) {
    alerts.push({
      id: 'unregistered',
      tone: 'warning',
      icon: AlertTriangle,
      title: t('unregisteredTitle'),
      detail: t('unregisteredDetail', { count: unregistered.length }),
      href: '/settings?tab=channels',
    });
  }

  const cutoff = now - STALE_MS;
  const stale = health.channels.filter(
    (c) => !c.last_checked_at || new Date(c.last_checked_at).getTime() < cutoff
  );
  if (stale.length > 0) {
    alerts.push({
      id: 'health-stale',
      tone: 'warning',
      icon: Clock3,
      title: t('staleTitle'),
      detail: t('staleDetail', { count: stale.length }),
      href: '/settings?tab=health',
    });
  }

  if (!health.ai.configured || !health.ai.active) {
    alerts.push({
      id: 'ai-off',
      tone: 'warning',
      icon: Sparkles,
      title: t('aiTitle'),
      detail: t('aiDetail'),
      href: '/settings?tab=ai',
    });
  }

  if (!health.cron.configured) {
    alerts.push({
      id: 'cron-off',
      tone: 'warning',
      icon: Clock3,
      title: t('cronTitle'),
      detail: t('cronDetail'),
      href: '/settings?tab=health',
    });
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        {t('allClear')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.slice(0, 4).map((alert) => {
        const Icon = alert.icon;
        return (
          <Link
            key={alert.id}
            href={alert.href}
            className={
              alert.tone === 'critical'
                ? 'border-status-critical/25 bg-status-critical/5 flex items-start gap-3 rounded-xl border px-4 py-3'
                : 'border-status-warning/25 bg-status-warning/5 flex items-start gap-3 rounded-xl border px-4 py-3'
            }
          >
            <Icon
              className={
                alert.tone === 'critical'
                  ? 'text-status-critical mt-0.5 h-4 w-4 shrink-0'
                  : 'text-status-warning mt-0.5 h-4 w-4 shrink-0'
              }
            />
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-medium">
                {alert.title}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {alert.detail}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
