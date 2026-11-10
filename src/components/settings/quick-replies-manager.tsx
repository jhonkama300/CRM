'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  Upload,
  CheckCheck,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SettingsPanelHead } from './settings-panel-head';
import { InteractivePreview } from '@/components/interactive/interactive-preview';
import {
  InteractiveBuilder,
  blankButtonsPayload,
} from '@/components/interactive/interactive-builder';
import {
  interactivePayloadPreviewText,
  type InteractiveAudioPayload,
  type InteractiveCtaPayload,
  type InteractiveMediaPayload,
  type InteractiveMessagePayload,
  type InteractiveRequestContactPayload,
} from '@/lib/whatsapp/interactive';
import { INTERACTIVE_LIMITS } from '@/lib/whatsapp/meta-api';
import {
  MEDIA_MAX_BYTES_BY_KIND,
  uploadAccountMedia,
} from '@/lib/storage/upload-media';
import type { QuickReply, QuickReplyKind } from '@/types';

const CHAT_MEDIA_BUCKET = 'chat-media';

const QUICK_REPLY_VARIABLES = [
  { token: '{{name}}', key: 'varName', sample: 'Juan Pérez' },
  { token: '{{phone}}', key: 'varPhone', sample: '+57 300 000 0000' },
  { token: '{{email}}', key: 'varEmail', sample: 'juan@empresa.com' },
  { token: '{{company}}', key: 'varCompany', sample: 'Empresa SAS' },
  { token: '{{username}}', key: 'varUsername', sample: '@juan' },
] as const;

const SAMPLE_VARIABLES: Record<string, string> = {
  name: 'Juan Pérez',
  nombre: 'Juan Pérez',
  phone: '+57 300 000 0000',
  telefono: '+57 300 000 0000',
  email: 'juan@empresa.com',
  correo: 'juan@empresa.com',
  company: 'Empresa SAS',
  empresa: 'Empresa SAS',
  username: '@juan',
  usuario: '@juan',
  bsuid: 'US.1234567890',
}

function withSampleVariables(value: string): string {
  return value.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, key: string) =>
    SAMPLE_VARIABLES[key.toLowerCase()] ?? match,
  )
}

function withSamplePayloadVariables<T>(payload: T): T {
  const json = JSON.stringify(payload)
  return JSON.parse(
    json.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, key: string) =>
      SAMPLE_VARIABLES[key.toLowerCase()] ?? match,
    ),
  ) as T
}

type DraftKind = QuickReplyKind | 'media' | 'audio' | 'cta' | 'contact';

interface DraftState {
  id?: string;
  title: string;
  kind: DraftKind;
  content_text: string;
  interactive_payload: InteractiveMessagePayload;
  media: InteractiveMediaPayload | null;
  audio: InteractiveAudioPayload | null;
}

function emptyMediaPayload(): InteractiveMediaPayload {
  return {
    kind: 'media',
    body: '',
    header_media: { type: 'image', url: '' },
    buttons: [],
  };
}

function emptyDraft(): DraftState {
  return {
    title: '',
    kind: 'text',
    content_text: '',
    interactive_payload: blankButtonsPayload(),
    media: null,
    audio: null,
  };
}

function emptyCtaPayload(): InteractiveCtaPayload {
  return {
    kind: 'cta',
    body: '',
    cta_type: 'url',
    display_text: '',
    value: '',
  };
}

function emptyContactPayload(): InteractiveRequestContactPayload {
  return { kind: 'request_contact_info', body: '' };
}

function emptyAudioPayload(): InteractiveAudioPayload {
  return { kind: 'audio', body: '', audio_url: '' };
}

export function QuickRepliesManager() {
  const t = useTranslations('Settings.quickReplies');
  const tInteractive = useTranslations('Interactive');
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuickReply | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quick-replies', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems((data.quick_replies as QuickReply[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => setDraft(emptyDraft());
  const openEdit = (qr: QuickReply) => {
    const payload = qr.interactive_payload;
    const isMedia = qr.kind === 'interactive' && payload?.kind === 'media';
    const isAudio = qr.kind === 'interactive' && payload?.kind === 'audio';
    const isCta = qr.kind === 'interactive' && payload?.kind === 'cta';
    const isContact =
      qr.kind === 'interactive' && payload?.kind === 'request_contact_info';
    let kind: DraftKind = qr.kind;
    if (isMedia) kind = 'media';
    else if (isAudio) kind = 'audio';
    else if (isCta) kind = 'cta';
    else if (isContact) kind = 'contact';
    setDraft({
      id: qr.id,
      title: qr.title,
      kind,
      content_text: qr.content_text ?? '',
      interactive_payload: qr.interactive_payload ?? blankButtonsPayload(),
      media: isMedia ? (payload as InteractiveMediaPayload) : null,
      audio: isAudio ? (payload as InteractiveAudioPayload) : null,
    });
  };

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error(t('nameRequired'));
      return;
    }
    let payload;
    if (draft.kind === 'media') {
      if (!draft.media?.header_media.url) {
        toast.error(t('mediaRequired'));
        return;
      }
      if (!draft.media.body.trim()) {
        toast.error(t('mediaBodyRequired'));
        return;
      }
      payload = {
        title: draft.title,
        kind: 'interactive',
        interactive_payload: draft.media,
      };
    } else if (draft.kind === 'audio') {
      if (!draft.audio?.audio_url) {
        toast.error(t('mediaRequired'));
        return;
      }
      payload = {
        title: draft.title,
        kind: 'interactive',
        interactive_payload: draft.audio,
      };
    } else if (draft.kind === 'cta') {
      const cta = draft.interactive_payload as InteractiveCtaPayload;
      payload = {
        title: draft.title,
        kind: 'interactive',
        interactive_payload: { ...cta, cta_type: 'url' },
      };
    } else if (draft.kind === 'contact') {
      payload = {
        title: draft.title,
        kind: 'interactive',
        interactive_payload: draft.interactive_payload,
      };
    } else if (draft.kind === 'interactive') {
      payload = {
        title: draft.title,
        kind: 'interactive',
        interactive_payload: draft.interactive_payload,
      };
    } else {
      payload = {
        title: draft.title,
        kind: 'text',
        content_text: draft.content_text,
      };
    }

    setSaving(true);
    try {
      const res = await fetch(
        draft.id ? `/api/quick-replies/${draft.id}` : '/api/quick-replies',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('saveError'));
        return;
      }
      toast.success(draft.id ? t('updated') : t('created'));
      setDraft(null);
      await load();
    } catch {
      toast.error(t('saveError'));
    } finally {
      setSaving(false);
    }
  }, [draft, load, t]);

  const remove = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/quick-replies/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error(t('deleteError'));
        return;
      }
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load, t]);

  return (
    <div>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t('new')}
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((qr) => (
            <li
              key={qr.id}
              className="border-border bg-card flex items-start gap-3 rounded-lg border p-3"
            >
              <QuickReplyIcon qr={qr} />
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-medium">
                  {qr.title}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {qr.kind === 'interactive' && qr.interactive_payload
                    ? interactivePayloadPreviewText(qr.interactive_payload)
                    : qr.content_text}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(qr)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleteTarget(qr)}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="flex h-[70dvh] flex-col gap-0 overflow-hidden p-0 sm:h-[70vh] sm:max-h-[70vh] sm:w-[70vw] sm:max-w-[70vw]">
          <DialogHeader className="border-border border-b px-5 py-4">
            <DialogTitle>{draft?.id ? t('edit') : t('new')}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs">
                    {t('nameLabel')}
                  </label>
                  <Input
                    value={draft.title}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                    placeholder={t('namePlaceholder')}
                    className="bg-muted text-foreground"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <KindTab
                    active={draft.kind === 'text'}
                    label={t('kindText')}
                    onClick={() => setDraft({ ...draft, kind: 'text' })}
                  />
                  <KindTab
                    active={draft.kind === 'interactive'}
                    label={t('kindInteractive')}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        kind: 'interactive',
                        interactive_payload:
                          draft.interactive_payload.kind === 'buttons' ||
                          draft.interactive_payload.kind === 'list'
                            ? draft.interactive_payload
                            : blankButtonsPayload(),
                      })
                    }
                  />
                  <KindTab
                    active={draft.kind === 'media'}
                    label={t('kindMedia')}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        kind: 'media',
                        media: draft.media ?? emptyMediaPayload(),
                      })
                    }
                  />
                  <KindTab
                    active={draft.kind === 'audio'}
                    label={t('kindAudio')}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        kind: 'audio',
                        audio: draft.audio ?? emptyAudioPayload(),
                      })
                    }
                  />
                  <KindTab
                    active={draft.kind === 'cta'}
                    label={t('kindCta')}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        kind: 'cta',
                        interactive_payload: emptyCtaPayload(),
                      })
                    }
                  />
                  <KindTab
                    active={draft.kind === 'contact'}
                    label={t('kindContact')}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        kind: 'contact',
                        interactive_payload: emptyContactPayload(),
                      })
                    }
                  />
                </div>
                {draft.kind === 'text' ? (
                  <div className="space-y-2">
                    <Textarea
                      value={draft.content_text}
                      onChange={(e) =>
                        setDraft({ ...draft, content_text: e.target.value })
                      }
                      placeholder={t('textPlaceholder')}
                      className="bg-muted text-foreground min-h-28"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground text-[10px]">
                        {t('variablesHint')}
                      </span>
                      {QUICK_REPLY_VARIABLES.map((variable) => (
                        <button
                          key={variable.token}
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              content_text: draft.content_text + variable.token,
                            })
                          }
                          className="border-border bg-muted text-muted-foreground hover:text-foreground rounded-full border px-2 py-0.5 text-[10px]"
                        >
                          {t(variable.key)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : draft.kind === 'interactive' ? (
                  <InteractiveBuilder
                    value={draft.interactive_payload}
                    onChange={(p) =>
                      setDraft({ ...draft, interactive_payload: p })
                    }
                    showPreview={false}
                  />
                ) : draft.media ? (
                  <MediaEditor
                    media={draft.media}
                    onChange={(media) => setDraft({ ...draft, media })}
                    t={t}
                  />
                ) : draft.kind === 'audio' && draft.audio ? (
                  <AudioEditor
                    audio={draft.audio}
                    onChange={(audio) => setDraft({ ...draft, audio })}
                    t={t}
                  />
                ) : draft.kind === 'cta' ? (
                  <CtaEditor
                    value={draft.interactive_payload as InteractiveCtaPayload}
                    onChange={(interactive_payload) =>
                      setDraft({ ...draft, interactive_payload })
                    }
                    t={t}
                  />
                ) : draft.kind === 'contact' ? (
                  <ContactEditor
                    value={
                      draft.interactive_payload as InteractiveRequestContactPayload
                    }
                    onChange={(interactive_payload) =>
                      setDraft({ ...draft, interactive_payload })
                    }
                    t={t}
                  />
                ) : null}
              </div>

              <aside className="border-border bg-muted/20 hidden w-[340px] shrink-0 flex-col overflow-y-auto border-l p-4 lg:flex">
                <div className="text-muted-foreground flex items-center gap-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
                  <MessageSquare className="text-primary size-3.5" />
                  {t('previewTitle')}
                </div>
                <div className="mt-3 flex flex-1 items-start justify-center overflow-y-auto rounded-2xl bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_65%)] p-4">
                  <div className="w-full max-w-[280px]">
                    <p className="text-muted-foreground mb-2 text-center text-[10px]">
                      WhatsApp
                    </p>
                    {draft.kind === 'text' ? (
                      <div className="ml-auto max-w-[250px] rounded-xl rounded-tr-sm bg-emerald-100 px-3 py-2 text-sm text-emerald-950 shadow-sm dark:bg-emerald-900/60 dark:text-emerald-50">
                        <p className="break-words whitespace-pre-wrap">
                          {draft.content_text
                            ? withSampleVariables(draft.content_text)
                            : null}
                          {!draft.content_text && (
                            <span className="opacity-60">
                              {t('previewEmpty')}
                            </span>
                          )}
                        </p>
                        <div className="mt-1 flex items-center justify-end gap-1 text-[9px] opacity-60">
                          {new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          <CheckCheck className="size-3" />
                        </div>
                      </div>
                    ) : draft.kind === 'interactive' ? (
                      <InteractivePreview
                        payload={withSamplePayloadVariables(draft.interactive_payload)}
                        labels={{
                          body: tInteractive('previewBody'),
                          button: tInteractive('previewButton'),
                          menu: tInteractive('previewMenu'),
                        }}
                        className="ml-auto"
                      />
                    ) : draft.kind === 'audio' && draft.audio?.audio_url ? (
                      <InteractivePreview
                        payload={withSamplePayloadVariables(draft.audio)}
                        labels={{
                          body: tInteractive('previewBody'),
                          button: tInteractive('previewButton'),
                          menu: tInteractive('previewMenu'),
                        }}
                        className="ml-auto"
                      />
                    ) : draft.kind === 'cta' || draft.kind === 'contact' ? (
                      <InteractivePreview
                        payload={draft.interactive_payload}
                        labels={{
                          body: tInteractive('previewBody'),
                          button: tInteractive('previewButton'),
                          menu: tInteractive('previewMenu'),
                          contact: t('contactShareLabel'),
                        }}
                        className="ml-auto"
                      />
                    ) : draft.media?.header_media.url ? (
                      <InteractivePreview
                        payload={withSamplePayloadVariables(draft.media)}
                        labels={{
                          body: tInteractive('previewBody'),
                          button: tInteractive('previewButton'),
                          menu: tInteractive('previewMenu'),
                        }}
                        className="ml-auto"
                      />
                    ) : (
                      <div className="border-border bg-card text-muted-foreground flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center text-[11px]">
                        <ImageIcon className="text-muted-foreground/50 mb-2 size-6" />
                        {t('previewMediaEmpty')}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
                  {t('previewHint')}
                </p>
              </aside>
            </div>
          )}
          <DialogFooter className="border-border bg-muted/30 mx-0 mb-0 border-t px-5 py-4">
            <Button
              variant="outline"
              onClick={() => setDraft(null)}
              disabled={saving}
            >
              {t('cancel')}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground flex items-center gap-2">
              <Trash2 className="text-destructive size-4" />
              {t('deleteTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-border bg-muted/30 mx-0 mb-0 border-t">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void remove()}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t('deleteButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KindTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'border-primary bg-primary/10 text-primary flex-1 rounded-md border px-3 py-1.5 text-sm font-medium'
          : 'border-border bg-muted text-muted-foreground hover:text-foreground flex-1 rounded-md border px-3 py-1.5 text-sm font-medium'
      }
    >
      {label}
    </button>
  );
}

const DOC_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

const DOC_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain';

function QuickReplyIcon({ qr }: { qr: QuickReply }) {
  const payload = qr.interactive_payload;
  if (qr.kind === 'interactive' && payload?.kind === 'media') {
    const type = payload.header_media.type;
    const Icon =
      type === 'image' ? ImageIcon : type === 'video' ? Film : FileText;
    return <Icon className="text-primary mt-0.5 h-4 w-4 shrink-0" />;
  }
  return qr.kind === 'interactive' ? (
    <Zap className="text-primary mt-0.5 h-4 w-4 shrink-0" />
  ) : (
    <MessageSquare className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
  );
}

function CtaEditor({
  value,
  onChange,
  t,
}: {
  value: InteractiveCtaPayload;
  onChange: (payload: InteractiveCtaPayload) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const set = (patch: Partial<InteractiveCtaPayload>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div>
        <label className="text-muted-foreground mb-1 block text-xs">
          {t('bodyLabel')}
        </label>
        <Textarea
          value={value.body}
          maxLength={INTERACTIVE_LIMITS.bodyMaxLength}
          onChange={(e) => set({ body: e.target.value })}
          className="bg-muted text-foreground min-h-24"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={value.header ?? ''}
          maxLength={INTERACTIVE_LIMITS.headerTextMaxLength}
          onChange={(e) => set({ header: e.target.value })}
          placeholder={t('headerLabel')}
          className="bg-muted text-foreground"
        />
        <Input
          value={value.footer ?? ''}
          maxLength={INTERACTIVE_LIMITS.footerMaxLength}
          onChange={(e) => set({ footer: e.target.value })}
          placeholder={t('footerLabel')}
          className="bg-muted text-foreground"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={value.display_text}
          maxLength={INTERACTIVE_LIMITS.buttonTitleMaxLength}
          onChange={(e) =>
            set({ display_text: e.target.value, cta_type: 'url' })
          }
          placeholder={t('ctaButtonLabel')}
          className="bg-muted text-foreground"
        />
        <Input
          value={value.value}
          onChange={(e) => set({ value: e.target.value, cta_type: 'url' })}
          placeholder="https://..."
          className="bg-muted text-foreground"
        />
      </div>
      <p className="text-muted-foreground text-[11px]">{t('ctaUrlOnly')}</p>
    </div>
  );
}

function ContactEditor({
  value,
  onChange,
  t,
}: {
  value: InteractiveRequestContactPayload;
  onChange: (payload: InteractiveRequestContactPayload) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const set = (patch: Partial<InteractiveRequestContactPayload>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div>
        <label className="text-muted-foreground mb-1 block text-xs">
          {t('bodyLabel')}
        </label>
        <Textarea
          value={value.body}
          maxLength={INTERACTIVE_LIMITS.bodyMaxLength}
          onChange={(e) => set({ body: e.target.value })}
          className="bg-muted text-foreground min-h-24"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={value.header ?? ''}
          maxLength={INTERACTIVE_LIMITS.headerTextMaxLength}
          onChange={(e) => set({ header: e.target.value })}
          placeholder={t('headerLabel')}
          className="bg-muted text-foreground"
        />
        <Input
          value={value.footer ?? ''}
          maxLength={INTERACTIVE_LIMITS.footerMaxLength}
          onChange={(e) => set({ footer: e.target.value })}
          placeholder={t('footerLabel')}
          className="bg-muted text-foreground"
        />
      </div>
      <p className="text-muted-foreground text-[11px]">
        {t('contactShareLabel')}
      </p>
    </div>
  );
}

function AudioEditor({
  audio,
  onChange,
  t,
}: {
  audio: InteractiveAudioPayload;
  onChange: (audio: InteractiveAudioPayload) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      toast.error(t('mediaUnsupported'));
      return;
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.audio) {
      toast.error(
        t('fileTooLarge', {
          max: (MEDIA_MAX_BYTES_BY_KIND.audio / 1024 / 1024).toFixed(0),
        })
      );
      return;
    }
    setUploading(true);
    try {
      const { publicUrl } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
      onChange({ ...audio, audio_url: publicUrl, title: file.name });
    } catch {
      toast.error(t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {audio.audio_url ? (
        <audio src={audio.audio_url} controls className="w-full" />
      ) : (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-xs">
          <Upload className="size-5" />
          {t('audioHint')}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-1 h-4 w-4" />
        )}
        {audio.audio_url ? t('changeFile') : t('chooseFile')}
      </Button>
    </div>
  );
}
function MediaEditor({
  media,
  onChange,
  t,
}: {
  media: InteractiveMediaPayload;
  onChange: (media: InteractiveMediaPayload) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const type = media.header_media.type;
  const buttons = media.buttons ?? [];
  const set = (patch: Partial<InteractiveMediaPayload>) =>
    onChange({ ...media, ...patch });

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (type === 'image' && !file.type.startsWith('image/')) {
      toast.error(t('mediaUnsupported'));
      return;
    }
    if (type === 'video' && !file.type.startsWith('video/')) {
      toast.error(t('mediaUnsupported'));
      return;
    }
    if (type === 'document' && !DOC_MIME.has(file.type)) {
      toast.error(t('mediaUnsupported'));
      return;
    }
    const max = MEDIA_MAX_BYTES_BY_KIND[type];
    if (file.size > max) {
      toast.error(t('fileTooLarge', { max: (max / 1024 / 1024).toFixed(0) }));
      return;
    }
    setUploading(true);
    try {
      const { publicUrl } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
      set({
        header_media: {
          type,
          url: publicUrl,
          filename: type === 'document' ? file.name : undefined,
        },
      });
    } catch {
      toast.error(t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  function addButton() {
    if (buttons.length >= INTERACTIVE_LIMITS.maxButtons) return;
    let n = buttons.length + 1;
    while (buttons.some((b) => b.id === `btn_${n}`)) n++;
    set({ buttons: [...buttons, { id: `btn_${n}`, title: '' }] });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-muted-foreground mb-1 block text-xs">
          {t('mediaType')}
        </label>
        <select
          value={type}
          onChange={(e) => {
            const next = e.target.value as 'image' | 'video' | 'document';
            set({ header_media: { type: next, url: '' } });
          }}
          className="border-border bg-muted text-foreground focus:border-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
        >
          <option value="image">{t('mediaImage')}</option>
          <option value="video">{t('mediaVideo')}</option>
          <option value="document">{t('mediaDocument')}</option>
        </select>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={
          type === 'image'
            ? 'image/*'
            : type === 'video'
              ? 'video/*'
              : DOC_ACCEPT
        }
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {media.header_media.url ? (
        <div className="border-border overflow-hidden rounded-lg border">
          {type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.header_media.url}
              alt=""
              className="max-h-44 w-full object-cover"
            />
          ) : type === 'video' ? (
            <video
              src={media.header_media.url}
              controls
              className="max-h-44 w-full bg-black object-contain"
            />
          ) : (
            <div className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {media.header_media.filename ?? t('mediaDocument')}
              </span>
            </div>
          )}
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-1 h-4 w-4" />
        )}
        {media.header_media.url ? t('changeFile') : t('chooseFile')}
      </Button>

      <div>
        <label className="text-muted-foreground mb-1 block text-xs">
          {t('bodyLabel')}
        </label>
        <Textarea
          value={media.body}
          maxLength={INTERACTIVE_LIMITS.bodyMaxLength}
          onChange={(e) => set({ body: e.target.value })}
          placeholder={t('textPlaceholder')}
          className="bg-muted text-foreground min-h-24"
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-[10px]">
            {t('variablesHint')}
          </span>
          {QUICK_REPLY_VARIABLES.map((variable) => (
            <button
              key={variable.token}
              type="button"
              onClick={() => set({ body: media.body + variable.token })}
              className="border-border bg-muted text-muted-foreground hover:text-foreground rounded-full border px-2 py-0.5 text-[10px]"
            >
              {t(variable.key)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-muted-foreground mb-1 block text-xs">
          {t('footerLabel')}
        </label>
        <Input
          value={media.footer ?? ''}
          maxLength={INTERACTIVE_LIMITS.footerMaxLength}
          onChange={(e) => set({ footer: e.target.value })}
          className="bg-muted text-foreground"
        />
      </div>

      <div>
        <label className="text-muted-foreground mb-1 block text-xs">
          {t('buttonsOptional')}
        </label>
        <div className="flex flex-col gap-2">
          {buttons.map((b, index) => (
            <div key={b.id} className="flex items-center gap-2">
              <Input
                value={b.title}
                maxLength={INTERACTIVE_LIMITS.buttonTitleMaxLength}
                onChange={(e) =>
                  set({
                    buttons: buttons.map((item, i) =>
                      i === index ? { ...item, title: e.target.value } : item
                    ),
                  })
                }
                placeholder={t('buttonPlaceholder')}
                className="bg-muted flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  set({ buttons: buttons.filter((_, i) => i !== index) })
                }
                className="text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        {buttons.length < INTERACTIVE_LIMITS.maxButtons && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addButton}
            className="mt-2"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('addButton')}
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-[11px]">{t('mediaHint')}</p>
    </div>
  );
}
