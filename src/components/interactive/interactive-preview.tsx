'use client';

import { FileText, List, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';

/**
 * WhatsApp-style read-only render of an interactive message. Used both
 * in the builder's live preview and by the inbox message bubble so a
 * sent buttons/list message shows the same way it does on the phone.
 *
 * Purely presentational — the buttons/rows are not clickable here (the
 * customer taps them on their own device). Kept namespace-free so it can
 * be dropped into the composer, the automation builder, and the
 * quick-replies manager without namespace coupling: the three fallback
 * labels shown for empty fields default to plain English, and a host
 * that has a translator can pass its own via `labels`.
 */
export interface InteractivePreviewLabels {
  /** Shown in place of an empty body. */
  body?: string;
  /** Shown in place of an untitled reply button. */
  button?: string;
  /** Shown in place of an empty list button label. */
  menu?: string;
  /** Label for a request-contact-info message. */
  contact?: string;
}

export function InteractivePreview({
  payload,
  className,
  labels,
  neutral = false,
}: {
  payload: InteractiveMessagePayload;
  className?: string;
  labels?: InteractivePreviewLabels;
  neutral?: boolean;
}) {
  const bodyLabel = labels?.body ?? 'Message body…';
  const buttonLabel = labels?.button ?? 'Button';
  const menuLabel = labels?.menu ?? 'Menu';
  const contactLabel = labels?.contact ?? 'Share contact';
  return (
    <div
      className={cn(
        'bg-card text-foreground ring-border w-full max-w-[260px] overflow-hidden rounded-lg shadow-sm ring-1',
        className
      )}
    >
      {payload.kind === 'audio' ? (
        <div className="border-border border-b p-3">
          <audio src={payload.audio_url} controls className="w-full" />
        </div>
      ) : null}
      {payload.kind === 'media' ? (
        <div className="border-border border-b">
          {payload.header_media.type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={payload.header_media.url}
              alt=""
              className="max-h-44 w-full object-cover"
            />
          ) : payload.header_media.type === 'video' ? (
            <video
              src={payload.header_media.url}
              controls
              className="max-h-44 w-full bg-black object-contain"
            />
          ) : (
            <div className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="break-words whitespace-normal">
                {payload.header_media.filename ?? 'Document'}
              </span>
            </div>
          )}
        </div>
      ) : null}
      {payload.kind !== 'audio' ? (
        <div className="px-3 py-2">
          {payload.header ? (
            <p className="mb-1 text-sm font-semibold break-words">
              {payload.header}
            </p>
          ) : null}
          <p className="text-sm break-words whitespace-pre-wrap">
            {payload.body || (
              <span className="text-muted-foreground">{bodyLabel}</span>
            )}
          </p>
          {payload.footer ? (
            <p className="text-muted-foreground mt-1 text-[11px] break-words">
              {payload.footer}
            </p>
          ) : null}
        </div>
      ) : null}

      {payload.kind === 'buttons' && payload.buttons.length > 0 ? (
        <div className="border-border flex flex-col border-t">
          {payload.buttons.map((b, i) => (
            <button
              key={b.id || i}
              type="button"
              disabled
              className={cn(
                'border-border flex items-center justify-center gap-1.5 border-t py-2 text-sm font-medium first:border-t-0',
                neutral ? 'text-foreground' : 'text-primary'
              )}
            >
              <Reply className="h-3.5 w-3.5" />
              <span className="break-words whitespace-normal">
                {b.title || buttonLabel}
              </span>
            </button>
          ))}
        </div>
      ) : payload.kind === 'media' && (payload.buttons?.length ?? 0) > 0 ? (
        <div className="border-border flex flex-col border-t">
          {payload.buttons!.map((b, i) => (
            <button
              key={b.id || i}
              type="button"
              disabled
              className={cn(
                'border-border flex items-center justify-center gap-1.5 border-t py-2 text-sm font-medium first:border-t-0',
                neutral ? 'text-foreground' : 'text-primary'
              )}
            >
              <Reply className="h-3.5 w-3.5" />
              <span className="break-words whitespace-normal">
                {b.title || buttonLabel}
              </span>
            </button>
          ))}
        </div>
      ) : payload.kind === 'list' ? (
        <button
          type="button"
          disabled
          className={cn(
            'border-border flex w-full items-center justify-center gap-1.5 border-t py-2 text-sm font-medium',
            neutral ? 'text-foreground' : 'text-primary'
          )}
        >
          <List className="h-3.5 w-3.5" />
          <span className="break-words whitespace-normal">
            {payload.button_label || menuLabel}
          </span>
        </button>
      ) : payload.kind === 'cta' ? (
        <button
          type="button"
          disabled
          className="border-border text-primary flex w-full items-center justify-center gap-1.5 border-t py-2 text-sm font-medium"
        >
          <Reply className="h-3.5 w-3.5" />
          <span className="break-words whitespace-normal">
            {payload.display_text}
          </span>
        </button>
      ) : payload.kind === 'request_contact_info' ? (
        <button
          type="button"
          disabled
          className="border-border text-primary flex w-full items-center justify-center gap-1.5 border-t py-2 text-sm font-medium"
        >
          <Reply className="h-3.5 w-3.5" />
          <span className="break-words whitespace-normal">{contactLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
