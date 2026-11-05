"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type {
  Message,
  MessageReaction,
  MessageTemplate,
  TemplateButton,
} from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  MapPin,
  LayoutTemplate,
  CornerDownLeft,
  Sparkles,
  Reply,
  ExternalLink,
  Phone,
  Copy,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import {
  MediaAudioBubble,
  MediaDocumentBubble,
  MediaImageBubble,
  MediaUnavailable,
  MediaVideoBubble,
} from "./message-media";
import { InteractivePreview } from "@/components/interactive/interactive-preview";
import {
  templateMessageView,
  type TemplateMessageHeader,
} from "@/lib/whatsapp/template-message-view";
import { useTranslations } from "next-intl";

interface MessageBubbleProps {
  message: Message;
  template?: MessageTemplate | null;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  /** Name shown as the title inside the bubble for the first message of a sender run. */
  senderName?: string;
  showSenderName?: boolean;
  reactions?: MessageReaction[];
  onToggleReaction?: (emoji: string) => void;
  /**
   * Opens the thread's media viewer on this message. Only images and videos
   * call it; omitted when the parent renders no viewer, in which case media
   * stays inline and non-clickable.
   */
  onOpenMedia?: (messageId: string) => void;
  /** Retry an outbound message that failed to send. */
  onRetry?: () => void;
  /** Retry the inbound media mirror/download for this message. */
  onRetryMedia?: () => void;
}

/**
 * "[title] — [details]" for a failed message, or null when the row
 * predates migration 042 / Meta sent no reason. Shared by the status
 * icon's tooltip and the line under the bubble.
 */
/** InteractivePreview with the empty-state labels in the UI language. */
function LocalizedInteractivePreview({
  payload,
}: {
  payload: NonNullable<Message["interactive_payload"]>;
}) {
  const t = useTranslations("Interactive");
  return (
    <InteractivePreview
      payload={payload}
      neutral
      labels={{
        body: t("previewBody"),
        button: t("previewButton"),
        menu: t("previewMenu"),
      }}
    />
  );
}

const TEMPLATE_BUTTON_ICONS: Record<TemplateButton["type"], LucideIcon> = {
  QUICK_REPLY: Reply,
  URL: ExternalLink,
  PHONE_NUMBER: Phone,
  COPY_CODE: Copy,
};

function TemplateHeader({
  header,
  message,
  t,
}: {
  header: TemplateMessageHeader;
  message: Message;
  t: ReturnType<typeof useTranslations>;
}) {
  if (header.type === "text") {
    return (
      <p className="mt-1 break-words text-sm font-semibold">{header.text}</p>
    );
  }
  if (!header.url) {
    const label =
      header.type === "image"
        ? t("photo")
        : header.type === "video"
          ? t("video")
          : t("document");
    return (
      <div className="mt-1">
        <MediaUnavailable label={label} t={t} />
      </div>
    );
  }
  const media = { ...message, media_url: header.url };
  return (
    <div className="mt-1">
      {header.type === "image" ? (
        <MediaImageBubble message={media} t={t} />
      ) : header.type === "video" ? (
        <MediaVideoBubble message={media} t={t} />
      ) : (
        <MediaDocumentBubble message={media} t={t} />
      )}
    </div>
  );
}

function failureReason(message: Message): string | null {
  if (message.status !== "failed" || !message.error_title) return null;
  return message.error_details
    ? `${message.error_title} — ${message.error_details}`
    : message.error_title;
}

function StatusIcon({
  status,
  title,
}: {
  status: Message["status"];
  /** Tooltip with delivery/read timestamps or the failure reason. */
  title?: string | null;
}) {
  const withTitle = (icon: ReactNode) =>
    title ? (
      <span className="inline-flex" title={title}>
        {icon}
      </span>
    ) : (
      icon
    );

  switch (status) {
    case "sending":
      return withTitle(<Clock className="h-3 w-3 text-muted-foreground" />);
    case "sent":
      return withTitle(<Check className="h-3 w-3 text-muted-foreground" />);
    case "delivered":
      return withTitle(
        <CheckCheck className="h-3 w-3 text-muted-foreground" />,
      );
    case "read":
      return withTitle(<CheckCheck className="h-3 w-3 text-sky-400" />);
    case "failed":
      return withTitle(<XCircle className="h-3 w-3 text-red-400" />);
    default:
      return null;
  }
}

function MessageContent({
  message,
  template,
  t,
  onOpenMedia,
  onRetryMedia,
}: {
  message: Message;
  template: MessageTemplate | null;
  t: ReturnType<typeof useTranslations>;
  onOpenMedia?: (messageId: string) => void;
  onRetryMedia?: () => void;
}) {
  // Passed to the media bubbles as a no-arg callback; `undefined` when the
  // parent wired up no viewer, which is what makes them non-clickable.
  const openMedia = onOpenMedia ? () => onOpenMedia(message.id) : undefined;

  switch (message.content_type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text}
        </p>
      );

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImageBubble message={message} onOpen={openMedia} t={t} />
          ) : (
            <MediaUnavailable label={t("photo")} t={t} onRetry={onRetryMedia} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <MediaVideoBubble message={message} onOpen={openMedia} t={t} />
          ) : (
            <MediaUnavailable label={t("video")} t={t} onRetry={onRetryMedia} />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div>
          {message.media_url ? (
            <MediaAudioBubble message={message} t={t} />
          ) : (
            <MediaUnavailable label={t("audio")} t={t} onRetry={onRetryMedia} />
          )}
        </div>
      );

    case "document":
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || t("document")} t={t} onRetry={onRetryMedia} />;
      }
      return <MediaDocumentBubble message={message} t={t} />;

    case "template": {
      // Templates are almost always outbound, where the bubble fill IS
      // `primary` — so the old `bg-primary/20 text-primary` chip was
      // primary-on-primary and invisible. Paired with a null
      // content_text (issue #483) that rendered a bubble with nothing
      // in it at all. Invert on the primary fill, and fall back to the
      // template's name when we have no stored body (legacy rows sent
      // before the fix).
      const view = templateMessageView(message, template);
      return (
        <div>
          <span className="mb-1 inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <LayoutTemplate className="h-3 w-3" />
            {t("template")}
          </span>
          {view.header && (
            <TemplateHeader header={view.header} message={message} t={t} />
          )}
          {message.content_text ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          ) : (
            message.template_name && (
              <p className="mt-1 break-words text-sm italic opacity-80">
                {message.template_name}
              </p>
            )
          )}
          {view.footer && (
            <p className="mt-1 break-words text-[11px] text-muted-foreground">
              {view.footer}
            </p>
          )}
          {view.buttons.length > 0 && (
            <div className="mt-2 flex flex-col border-t border-border">
              {view.buttons.map((button, i) => {
                const Icon = TEMPLATE_BUTTON_ICONS[button.type];
                return (
                  <span
                    key={i}
                    className="flex items-center justify-center gap-1.5 border-t border-border py-1.5 text-sm font-medium text-foreground first:border-t-0"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{button.text}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || t("locationShared")}</span>
        </div>
      );

    case "interactive": {
      // Three cases share content_type='interactive':
      //  - OUTBOUND with payload (composer / automation / Flow send after
      //    migration 035): render the buttons/list as they appear on the phone.
      //  - INBOUND tap (customer chose an option, sender_type='customer'):
      //    no payload; show the tapped option's title with a reply affordance
      //    so agents can tell it's a tap, not the customer typing.
      //  - OUTBOUND with NO payload (legacy bot/Flow sends from before
      //    migration 035 backfilled the column): show the body text plainly —
      //    it is our own message, NOT a customer tap.
      if (message.interactive_payload) {
        return <LocalizedInteractivePreview payload={message.interactive_payload} />;
      }
      if (message.sender_type === "customer") {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" />
              {t("buttonReply")}
            </span>
            <p className="whitespace-pre-wrap break-words text-sm">
              {message.content_text || t("interactiveReply")}
            </p>
          </div>
        );
      }
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("interactiveReply")}
        </p>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("unsupported")}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  template = null,
  reply,
  senderName,
  showSenderName = false,
  reactions,
  onToggleReaction,
  onOpenMedia,
  onRetry,
  onRetryMedia,
}: MessageBubbleProps) {
  const t = useTranslations("Inbox.bubble");

  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const time = format(new Date(message.created_at), "HH:mm");
  const failure = isAgent ? failureReason(message) : null;
  const timeLabel = (iso: string | null | undefined) =>
    iso ? format(new Date(iso), "HH:mm") : null;
  const deliveredLabel = timeLabel(message.delivered_at);
  const readLabel = timeLabel(message.read_at);
  const statusTitle =
    failure ??
    (message.status === "read"
      ? [
          deliveredLabel ? t("deliveredAt", { time: deliveredLabel }) : null,
          readLabel ? t("readAt", { time: readLabel }) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : message.status === "delivered" && deliveredLabel
        ? t("deliveredAt", { time: deliveredLabel })
        : message.status === "sent"
          ? t("sentAt", { time })
          : null);

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div
      className={cn(
        "flex flex-col",
        isAgent ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "relative rounded-2xl px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.10)]",
          isAgent
            ? "rounded-br-md border border-border/80 bg-secondary text-secondary-foreground"
            : "rounded-bl-md border border-border/80 bg-card text-card-foreground",
        )}
      >
        {showSenderName && senderName ? (
          <p
            className={cn(
              "mb-1.5 max-w-full truncate text-[10px] font-semibold leading-tight tracking-wide",
              "text-muted-foreground",
            )}
          >
            {senderName}
          </p>
        ) : null}
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            neutral
          />
        )}
        <MessageContent
          message={message}
          template={template}
          t={t}
          onOpenMedia={onOpenMedia}
          onRetryMedia={onRetryMedia}
        />
        <div
          className={cn(
            "mt-1.5 flex items-center gap-1",
            isAgent ? "justify-end" : "justify-start",
          )}
        >
          {/* AI badge — only on replies the auto-reply bot generated
              (always outbound, so it sits on the primary fill). Lets
              agents tell an AI reply from their own / a Flow's at a
              glance. */}
          {message.ai_generated && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted px-1.5 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-muted-foreground"
              title={t("aiBadgeTitle")}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {t("aiBadge")}
            </span>
          )}
          <span
            className={cn(
              "text-[9.5px] leading-none",
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface.
              "text-muted-foreground",
            )}
          >
            {time}
          </span>
          {isAgent && (
            <StatusIcon status={message.status} title={statusTitle} />
          )}
        </div>
      </div>
      {failure && (
        <div className="mt-0.5 flex items-center gap-2 px-1 text-[10px] leading-tight text-muted-foreground">
          <span className="min-w-0" title={failure}>
            {t("notDelivered")}: {failure}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 font-medium text-primary hover:underline"
            >
              {t("retry")}
            </button>
          )}
        </div>
      )}
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
