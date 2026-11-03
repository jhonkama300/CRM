"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsPanelHead } from "./settings-panel-head";
import {
  InteractiveBuilder,
  blankButtonsPayload,
} from "@/components/interactive/interactive-builder";
import {
  interactivePayloadPreviewText,
  type InteractiveMediaPayload,
  type InteractiveMessagePayload,
} from "@/lib/whatsapp/interactive";
import { INTERACTIVE_LIMITS } from "@/lib/whatsapp/meta-api";
import {
  MEDIA_MAX_BYTES_BY_KIND,
  uploadAccountMedia,
} from "@/lib/storage/upload-media";
import type { QuickReply, QuickReplyKind } from "@/types";

const CHAT_MEDIA_BUCKET = "chat-media";

type DraftKind = QuickReplyKind | "media";

interface DraftState {
  id?: string;
  title: string;
  kind: DraftKind;
  content_text: string;
  interactive_payload: InteractiveMessagePayload;
  media: InteractiveMediaPayload | null;
}

function emptyMediaPayload(): InteractiveMediaPayload {
  return {
    kind: "media",
    body: "",
    header_media: { type: "image", url: "" },
    buttons: [],
  };
}

function emptyDraft(): DraftState {
  return {
    title: "",
    kind: "text",
    content_text: "",
    interactive_payload: blankButtonsPayload(),
    media: null,
  };
}

export function QuickRepliesManager() {
  const t = useTranslations("Settings.quickReplies");
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quick-replies", { cache: "no-store" });
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
    const isMedia = qr.kind === "interactive" && payload?.kind === "media";
    setDraft({
      id: qr.id,
      title: qr.title,
      kind: isMedia ? "media" : qr.kind,
      content_text: qr.content_text ?? "",
      interactive_payload:
        qr.interactive_payload ?? blankButtonsPayload(),
      media: isMedia ? (payload as InteractiveMediaPayload) : null,
    });
  };

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    let payload;
    if (draft.kind === "media") {
      if (!draft.media?.header_media.url) {
        toast.error(t("mediaRequired"));
        return;
      }
      if (!draft.media.body.trim()) {
        toast.error(t("mediaBodyRequired"));
        return;
      }
      payload = {
        title: draft.title,
        kind: "interactive",
        interactive_payload: draft.media,
      };
    } else if (draft.kind === "interactive") {
      payload = {
        title: draft.title,
        kind: "interactive",
        interactive_payload: draft.interactive_payload,
      };
    } else {
      payload = {
        title: draft.title,
        kind: "text",
        content_text: draft.content_text,
      };
    }

    setSaving(true);
    try {
      const res = await fetch(
        draft.id ? `/api/quick-replies/${draft.id}` : "/api/quick-replies",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("saveError"));
        return;
      }
      toast.success(draft.id ? t("updated") : t("created"));
      setDraft(null);
      await load();
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }, [draft, load, t]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm(t("deleteConfirm"))) return;
      const res = await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("deleteError"));
        return;
      }
      await load();
    },
    [load, t],
  );

  return (
    <div>
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t("new")}
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((qr) => (
            <li
              key={qr.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              <QuickReplyIcon qr={qr} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{qr.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {qr.kind === "interactive" && qr.interactive_payload
                    ? interactivePayloadPreviewText(qr.interactive_payload)
                    : qr.content_text}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(qr)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(qr.id)}
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("edit") : t("new")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("nameLabel")}</label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={t("namePlaceholder")}
                  className="bg-muted text-foreground"
                />
              </div>
              <div className="flex gap-2">
                <KindTab
                  active={draft.kind === "text"}
                  label={t("kindText")}
                  onClick={() => setDraft({ ...draft, kind: "text" })}
                />
                <KindTab
                  active={draft.kind === "interactive"}
                  label={t("kindInteractive")}
                  onClick={() => setDraft({ ...draft, kind: "interactive" })}
                />
                <KindTab
                  active={draft.kind === "media"}
                  label={t("kindMedia")}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      kind: "media",
                      media: draft.media ?? emptyMediaPayload(),
                    })
                  }
                />
              </div>
              {draft.kind === "text" ? (
                <Textarea
                  value={draft.content_text}
                  onChange={(e) => setDraft({ ...draft, content_text: e.target.value })}
                  placeholder={t("textPlaceholder")}
                  className="min-h-28 bg-muted text-foreground"
                />
              ) : draft.kind === "interactive" ? (
                <InteractiveBuilder
                  value={draft.interactive_payload}
                  onChange={(p) => setDraft({ ...draft, interactive_payload: p })}
                />
              ) : draft.media ? (
                <MediaEditor
                  media={draft.media}
                  onChange={(media) => setDraft({ ...draft, media })}
                  t={t}
                />
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t("save")}
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
          ? "flex-1 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
          : "flex-1 rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {label}
    </button>
  );
}

const DOC_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

const DOC_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain";

function QuickReplyIcon({ qr }: { qr: QuickReply }) {
  const payload = qr.interactive_payload;
  if (qr.kind === "interactive" && payload?.kind === "media") {
    const type = payload.header_media.type;
    const Icon =
      type === "image" ? ImageIcon : type === "video" ? Film : FileText;
    return <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />;
  }
  return qr.kind === "interactive" ? (
    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
  ) : (
    <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
    if (type === "image" && !file.type.startsWith("image/")) {
      toast.error(t("mediaUnsupported"));
      return;
    }
    if (type === "video" && !file.type.startsWith("video/")) {
      toast.error(t("mediaUnsupported"));
      return;
    }
    if (type === "document" && !DOC_MIME.has(file.type)) {
      toast.error(t("mediaUnsupported"));
      return;
    }
    const max = MEDIA_MAX_BYTES_BY_KIND[type];
    if (file.size > max) {
      toast.error(
        t("fileTooLarge", { max: (max / 1024 / 1024).toFixed(0) }),
      );
      return;
    }
    setUploading(true);
    try {
      const { publicUrl } = await uploadAccountMedia(CHAT_MEDIA_BUCKET, file);
      set({
        header_media: {
          type,
          url: publicUrl,
          filename: type === "document" ? file.name : undefined,
        },
      });
    } catch {
      toast.error(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function addButton() {
    if (buttons.length >= INTERACTIVE_LIMITS.maxButtons) return;
    let n = buttons.length + 1;
    while (buttons.some((b) => b.id === `btn_${n}`)) n++;
    set({ buttons: [...buttons, { id: `btn_${n}`, title: "" }] });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("mediaType")}
        </label>
        <select
          value={type}
          onChange={(e) => {
            const next = e.target.value as "image" | "video" | "document";
            set({ header_media: { type: next, url: "" } });
          }}
          className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="image">{t("mediaImage")}</option>
          <option value="video">{t("mediaVideo")}</option>
          <option value="document">{t("mediaDocument")}</option>
        </select>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={
          type === "image" ? "image/*" : type === "video" ? "video/*" : DOC_ACCEPT
        }
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {media.header_media.url ? (
        <div className="overflow-hidden rounded-lg border border-border">
          {type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.header_media.url}
              alt=""
              className="max-h-44 w-full object-cover"
            />
          ) : type === "video" ? (
            <video
              src={media.header_media.url}
              controls
              className="max-h-44 w-full bg-black object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {media.header_media.filename ?? t("mediaDocument")}
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
        {media.header_media.url ? t("changeFile") : t("chooseFile")}
      </Button>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("bodyLabel")}
        </label>
        <Textarea
          value={media.body}
          maxLength={INTERACTIVE_LIMITS.bodyMaxLength}
          onChange={(e) => set({ body: e.target.value })}
          placeholder={t("textPlaceholder")}
          className="min-h-24 bg-muted text-foreground"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("footerLabel")}
        </label>
        <Input
          value={media.footer ?? ""}
          maxLength={INTERACTIVE_LIMITS.footerMaxLength}
          onChange={(e) => set({ footer: e.target.value })}
          className="bg-muted text-foreground"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("buttonsOptional")}
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
                      i === index ? { ...item, title: e.target.value } : item,
                    ),
                  })
                }
                placeholder={t("buttonPlaceholder")}
                className="flex-1 bg-muted"
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
            {t("addButton")}
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">{t("mediaHint")}</p>
    </div>
  );
}
