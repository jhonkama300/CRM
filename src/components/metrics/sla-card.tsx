'use client';

import { useState, type ChangeEvent, type ReactNode } from 'react';
import {
  Settings2,
  ShieldCheck,
  TimerReset,
  TriangleAlert,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  AccountMetrics,
  MetricsSlaSettings,
} from '@/lib/metrics/overview';
import { Skeleton } from '@/components/dashboard/skeleton';
import { cn } from '@/lib/utils';

export function SlaCard({
  data,
  onSaved,
}: {
  data: AccountMetrics | null;
  onSaved: () => void;
}) {
  const t = useTranslations('Metricas.sla');
  const format = useFormatter();

  if (!data) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { sla, summary, pending } = data;
  const compliance =
    summary.slaRate == null
      ? null
      : format.number(summary.slaRate, {
          style: 'percent',
          maximumFractionDigits: 0,
        });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <SlaSettingsDialog sla={sla} onSaved={onSaved} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={<TimerReset className="size-4" />}
            label={t('firstResponse')}
            value={t('minutes', { count: sla.firstResponseMinutes })}
          />
          <Stat
            icon={<TimerReset className="size-4" />}
            label={t('betweenMessages')}
            value={t('minutes', { count: sla.betweenMessagesMinutes })}
          />
          <Stat
            icon={<TriangleAlert className="size-4" />}
            label={t('pendingAlert')}
            value={t('minutes', { count: sla.pendingAlertMinutes })}
          />
          <Stat
            icon={<TriangleAlert className="size-4" />}
            label={t('critical')}
            value={t('minutes', { count: sla.criticalMinutes })}
          />
        </dl>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="bg-muted/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <ShieldCheck className="text-primary size-4" aria-hidden />
              {t('compliance')}
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {compliance ?? t('none')}
            </p>
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              {t('complianceDetail', {
                within: format.number(summary.withinTarget),
                total: format.number(summary.firstResponseCount),
              })}
            </p>
          </div>

          <div className="bg-muted/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <TimerReset className="text-primary size-4" aria-hidden />
              {t('pendingNow')}
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {format.number(pending.total)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              {t('pendingDetail', {
                warning: format.number(pending.warning),
                critical: format.number(pending.critical),
              })}
            </p>
            {pending.oldestMinutes != null ? (
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                {t('oldest', {
                  minutes: format.number(Math.round(pending.oldestMinutes)),
                })}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground flex items-center gap-1 text-xs">
        <span aria-hidden>{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function SlaSettingsDialog({
  sla,
  onSaved,
}: {
  sla: MetricsSlaSettings;
  onSaved: () => void;
}) {
  const t = useTranslations('Metricas.sla');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(sla);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setForm(sla);
      setError(null);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/metrics/sla', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t('saveFailed'));
      }
      const saved = (await response.json()) as MetricsSlaSettings;
      setForm(saved);
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const numeric = (
    key:
      | 'firstResponseMinutes'
      | 'betweenMessagesMinutes'
      | 'pendingAlertMinutes'
      | 'criticalMinutes'
  ) => ({
    type: 'number',
    min: 1,
    max: 1440,
    value: form[key],
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setForm((current) => ({
        ...current,
        [key]: Number.isFinite(value) ? value : 1,
      }));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Settings2 className="size-4" aria-hidden />
            {t('configure')}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sla-first">{t('firstResponse')}</Label>
            <Input id="sla-first" {...numeric('firstResponseMinutes')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-between">{t('betweenMessages')}</Label>
            <Input id="sla-between" {...numeric('betweenMessagesMinutes')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-pending">{t('pendingAlert')}</Label>
            <Input id="sla-pending" {...numeric('pendingAlertMinutes')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-critical">{t('critical')}</Label>
            <Input id="sla-critical" {...numeric('criticalMinutes')} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="sla-timezone">{t('timezone')}</Label>
            <Input
              id="sla-timezone"
              value={form.timezone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  timezone: event.target.value,
                }))
              }
            />
          </div>
        </div>

        {error ? (
          <p className={cn('text-destructive text-xs')} role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            {t('cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
