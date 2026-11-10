'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCan } from '@/hooks/use-can';
import type { Channel, Department } from '@/types';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  BarChart3,
  Building2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  Webhook,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmbeddedSignupButton } from '@/components/settings/embedded-signup-button';
import { ChannelUsageDialog } from '@/components/settings/channel-usage-dialog';
import { WhatsAppIcon } from '@/components/icons/whatsapp-icon';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ChannelDraft {
  name: string;
  color: string;
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  verify_token: string;
  pin: string;
  department_id: string | null;
}

const EMPTY: ChannelDraft = {
  name: '',
  color: '#25D366',
  phone_number_id: '',
  waba_id: '',
  access_token: '',
  verify_token: '',
  pin: '',
  department_id: null,
};

export function ChannelsPanel() {
  const t = useTranslations('Settings.channels');
  const canEdit = useCan('edit-settings');
  const supabase = useMemo(() => createClient(), []);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [draft, setDraft] = useState<ChannelDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingApi, setTestingApi] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('/api/whatsapp/webhook');
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageChannel, setUsageChannel] = useState<Channel | null>(null);

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [channelRes, deptRes] = await Promise.all([
      fetch('/api/channels', { cache: 'no-store' }).then((r) =>
        r.ok ? r.json() : { channels: [] }
      ),
      supabase.from('departments').select('*').order('name'),
    ]);
    setChannels((channelRes.channels ?? []) as Channel[]);
    setDepartments((deptRes.data ?? []) as Department[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (channel: Channel) => {
    setEditing(channel);
    setDraft({
      name: channel.name,
      color: channel.color,
      phone_number_id: channel.phone_number_id,
      waba_id: channel.waba_id ?? '',
      access_token: '',
      verify_token: '',
      pin: '',
      department_id: channel.department_id,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.phone_number_id.trim()) {
      toast.error(t('requiredFields'));
      return;
    }
    if (!editing && !draft.access_token.trim()) {
      toast.error(t('tokenRequired'));
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: draft.name.trim(),
        color: draft.color,
        waba_id: draft.waba_id.trim() || null,
        department_id: draft.department_id,
        verify_token: draft.verify_token.trim() || null,
      };
      if (draft.access_token.trim())
        body.access_token = draft.access_token.trim();
      if (draft.pin.trim()) body.pin = draft.pin.trim();
      if (!editing) body.phone_number_id = draft.phone_number_id.trim();

      const res = await fetch(
        editing ? `/api/channels/${editing.id}` : '/api/channels',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? t('saveFailed'));
        await fetchData();
        return;
      }
      toast.success(editing ? t('updated') : t('created'));
      setDialogOpen(false);
      await fetchData();
    } catch {
      toast.error(t('networkError'));
    } finally {
      setSaving(false);
    }
  };

  const testChannel = async (channel: Channel) => {
    setTestingId(channel.id);
    try {
      const res = await fetch(`/api/channels/${channel.id}/test`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? t('testFailed'));
      } else {
        toast.success(t('testOk'));
      }
      await fetchData();
    } catch {
      toast.error(t('networkError'));
    } finally {
      setTestingId(null);
    }
  };

  const testDraft = async () => {
    if (
      !draft.phone_number_id.trim() ||
      (!editing && !draft.access_token.trim())
    ) {
      toast.error(t('testApiMissing'));
      return;
    }

    setTestingApi(true);
    try {
      const payload: Record<string, unknown> = {
        phone_number_id: draft.phone_number_id.trim(),
        waba_id: draft.waba_id.trim() || null,
      };
      if (draft.access_token.trim()) {
        payload.access_token = draft.access_token.trim();
      }
      if (editing) payload.channel_id = editing.id;

      const res = await fetch('/api/channels/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? t('testApiFailed'));
        return;
      }
      toast.success(t('testApiOk'));
    } catch {
      toast.error(t('networkError'));
    } finally {
      setTestingApi(false);
    }
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success(t('copied'));
    } catch {
      toast.error(t('networkError'));
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/channels/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? t('deleteFailed'));
        return;
      }
      toast.success(t('deleted'));
      setDeleteTarget(null);
      await fetchData();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-foreground text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t('description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setUsageChannel(null);
              setUsageOpen(true);
            }}
            className="gap-1.5"
          >
            <BarChart3 className="h-4 w-4" />
            {t('globalUsage')}
          </Button>
          {canEdit && (
            <>
              <EmbeddedSignupButton onConnected={() => void fetchData()} />
              <Button onClick={openCreate} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {t('addChannel')}
              </Button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="border-border flex justify-center rounded-xl border py-16">
          <Loader2 className="text-primary h-5 w-5 animate-spin" />
        </div>
      ) : channels.length === 0 ? (
        <div className="border-border flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#25D366]/10 text-[#25D366] ring-1 ring-[#25D366]/20">
            <WhatsAppIcon className="h-7 w-7" />
          </span>
          <p className="text-foreground mt-3 text-sm font-medium">
            {t('empty')}
          </p>
          <p className="text-muted-foreground mt-1 max-w-sm text-xs">
            {t('emptyDesc')}
          </p>
          {canEdit && (
            <Button onClick={openCreate} className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" />
              {t('addChannel')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {channels.map((channel) => {
            const department = departments.find(
              (d) => d.id === channel.department_id
            );
            return (
              <div
                key={channel.id}
                className="border-border bg-card rounded-xl border p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: channel.color }}
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-foreground truncate text-sm font-semibold">
                        {channel.name}
                      </p>
                      {channel.source_config_id && (
                        <span className="border-primary/30 bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium tracking-wider uppercase">
                          <Star className="h-2.5 w-2.5" />
                          {t('primary')}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {channel.display_phone_number || channel.phone_number_id}
                      {department ? ` · ${department.name}` : ''}
                    </p>
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      WABA: {channel.waba_id || '-'} · {channel.status}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wide uppercase ${
                          channel.quality_rating === 'GREEN'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : channel.quality_rating === 'YELLOW'
                              ? 'bg-amber-500/10 text-amber-500'
                              : channel.quality_rating === 'RED'
                                ? 'bg-red-500/10 text-red-500'
                                : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {t('quality')}: {channel.quality_rating || 'UNKNOWN'}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wide uppercase ${
                          channel.registered_at
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-amber-500/10 text-amber-500'
                        }`}
                      >
                        {channel.registered_at
                          ? t('registered')
                          : t('notRegistered')}
                      </span>
                      {channel.messaging_limit && (
                        <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-wide uppercase">
                          {channel.messaging_limit}
                        </span>
                      )}
                    </div>
                    {channel.last_registration_error ? (
                      <p className="mt-1 line-clamp-2 text-[10px] text-amber-400">
                        {channel.last_registration_error}
                      </p>
                    ) : channel.last_error ? (
                      <p className="mt-1 line-clamp-2 text-[10px] text-red-400">
                        {channel.last_error}
                      </p>
                    ) : channel.last_checked_at ? (
                      <p className="text-muted-foreground mt-1 text-[10px]">
                        {t('lastChecked')}:{' '}
                        {new Date(channel.last_checked_at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        onClick={() => void testChannel(channel)}
                        disabled={testingId === channel.id}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 disabled:opacity-50"
                        title={t('test')}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${testingId === channel.id ? 'animate-spin' : ''}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(channel)}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
                        title={t('edit')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(channel)}
                        className="text-muted-foreground hover:bg-muted hover:text-destructive rounded p-1"
                        title={t('delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUsageChannel(channel);
                      setUsageOpen(true);
                    }}
                    className="gap-1.5"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    {t('usageAndStats')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader className="gap-3">
            <div className="flex items-start gap-3 pr-8">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#25D366]/10 text-[#25D366] ring-1 ring-[#25D366]/20">
                <WhatsAppIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <DialogTitle>
                  {editing ? t('editTitle') : t('newTitle')}
                </DialogTitle>
                <DialogDescription className="mt-1 leading-relaxed">
                  {t('connectIntro')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-6 py-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <aside className="space-y-4">
              <section className="border-border bg-muted/30 rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366] ring-1 ring-[#25D366]/20">
                    <WhatsAppIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-foreground text-sm font-semibold">
                      {t('instructionsTitle')}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                      {t('instructionsDesc')}
                    </p>
                  </div>
                </div>
                <Accordion className="mt-4">
                  {[
                    {
                      value: 'create-app',
                      title: t('stepCreateApp'),
                      details: t('stepCreateAppDetails'),
                    },
                    {
                      value: 'add-product',
                      title: t('stepAddProduct'),
                      details: t('stepAddProductDetails'),
                    },
                    {
                      value: 'get-credentials',
                      title: t('stepGetCredentials'),
                      details: t('stepGetCredentialsDetails'),
                    },
                    {
                      value: 'configure-webhooks',
                      title: t('stepConfigureWebhooks'),
                      details: t('stepConfigureWebhooksDetails'),
                    },
                  ].map((step, index) => (
                    <AccordionItem key={step.value} value={step.value}>
                      <AccordionTrigger className="gap-3 py-2 hover:no-underline">
                        <span className="flex flex-1 items-start gap-3 text-left">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#25D366]/25 bg-[#25D366]/10 text-[11px] font-semibold text-[#25D366]">
                            {index + 1}
                          </span>
                          <span className="text-foreground pt-0.5 text-xs leading-5 font-medium">
                            {step.title}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground pr-2 pb-3 pl-9 text-[11px] leading-relaxed">
                        {step.details}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                <a
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#25D366] hover:underline"
                >
                  {t('docsLink')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </section>

              <section className="border-border bg-card rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <Webhook className="text-muted-foreground h-4 w-4" />
                  <h3 className="text-foreground text-sm font-semibold">
                    {t('webhookTitle')}
                  </h3>
                </div>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {t('webhookDesc')}
                </p>
                <div className="border-border bg-background mt-3 flex items-center gap-2 rounded-lg border p-2">
                  <code className="text-foreground min-w-0 flex-1 truncate font-mono text-[11px]">
                    {webhookUrl}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void copyWebhook()}
                    title={t('copy')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span className="sr-only">{t('copy')}</span>
                  </Button>
                </div>
                <p className="text-muted-foreground mt-2 text-[10px]">
                  {t('webhookUrl')}
                </p>
              </section>
            </aside>

            <div className="space-y-5">
              <section className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <span className="bg-muted text-muted-foreground mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                    <Building2 className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <h3 className="text-foreground text-sm font-semibold">
                      {t('channelSection')}
                    </h3>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {t('channelSectionDesc')}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t('name')}</Label>
                    <Input
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, name: e.target.value }))
                      }
                      className="bg-muted border-border text-foreground"
                      placeholder={t('namePlaceholder')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('department')}</Label>
                    <Select
                      value={draft.department_id ?? '__none__'}
                      onValueChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          department_id: v === '__none__' ? null : (v ?? null),
                        }))
                      }
                    >
                      <SelectTrigger className="bg-muted border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {t('noDepartment')}
                        </SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('color')}</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={draft.color}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, color: e.target.value }))
                        }
                        className="border-border bg-muted h-8 w-10 shrink-0 rounded border"
                      />
                      <Input
                        value={draft.color}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, color: e.target.value }))
                        }
                        className="bg-muted border-border text-foreground font-mono"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <div className="bg-border h-px" />

              <section className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <span className="bg-muted text-muted-foreground mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                    <KeyRound className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <h3 className="text-foreground text-sm font-semibold">
                      {t('credentialsSection')}
                    </h3>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {t('credentialsSectionDesc')}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('phoneNumberId')}</Label>
                    <Input
                      value={draft.phone_number_id}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          phone_number_id: e.target.value,
                        }))
                      }
                      className="bg-muted border-border text-foreground"
                      disabled={!!editing}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('wabaId')}</Label>
                    <Input
                      value={draft.waba_id}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, waba_id: e.target.value }))
                      }
                      className="bg-muted border-border text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>
                      {editing ? t('accessTokenKeep') : t('accessToken')}
                    </Label>
                    <Input
                      type="password"
                      value={draft.access_token}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          access_token: e.target.value,
                        }))
                      }
                      className="bg-muted border-border text-foreground"
                      placeholder={
                        editing ? t('accessTokenKeepPlaceholder') : ''
                      }
                      autoComplete="off"
                    />
                  </div>
                </div>
              </section>

              <div className="bg-border h-px" />

              <section className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <span className="bg-muted text-muted-foreground mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <h3 className="text-foreground text-sm font-semibold">
                      {t('webhookSection')}
                    </h3>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {t('webhookSectionDesc')}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('verifyToken')}</Label>
                  <Input
                    value={draft.verify_token}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, verify_token: e.target.value }))
                    }
                    className="bg-muted border-border text-foreground"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('pin')}</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={draft.pin}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        pin: e.target.value.replace(/\D/g, '').slice(0, 6),
                      }))
                    }
                    className="bg-muted border-border text-foreground"
                    placeholder={t('pinPlaceholder')}
                    autoComplete="off"
                  />
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {t('pinHint')}
                  </p>
                </div>
              </section>
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => void testDraft()}
              disabled={saving || testingApi}
              className="gap-1.5"
            >
              <Loader2
                aria-hidden={!testingApi}
                className={testingApi ? 'h-4 w-4 animate-spin' : 'hidden'}
              />
              <PlugZap className={testingApi ? 'hidden' : 'h-4 w-4'} />
              <span>{testingApi ? t('testingApi') : t('testApi')}</span>
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={() => void save()}
                disabled={saving || testingApi}
              >
                <Loader2
                  aria-hidden={!saving}
                  className={saving ? 'mr-1.5 h-4 w-4 animate-spin' : 'hidden'}
                />
                <span>{editing ? t('save') : t('create')}</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteDesc', { name: deleteTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void remove()}
              disabled={deleting}
            >
              <Loader2
                aria-hidden={!deleting}
                className={deleting ? 'mr-1.5 h-4 w-4 animate-spin' : 'hidden'}
              />
              <span>{t('delete')}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChannelUsageDialog
        open={usageOpen}
        onOpenChange={setUsageOpen}
        channel={usageChannel}
        canEdit={canEdit}
      />
    </div>
  );
}
