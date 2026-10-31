"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Hand, Undo2, Loader2, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { fetchAiAccountStatus } from "@/lib/ai/account-status-cache";
import type { AiPauseReason } from "@/types";

interface AiThreadBannerProps {
  conversationId: string;
  /** `conversations.ai_autoreply_disabled` — bot paused on this thread. */
  disabled: boolean;
  /** `conversations.ai_pause_reason` — why the bot stopped here. */
  pauseReason?: AiPauseReason | null;
  /** `conversations.ai_paused_at` — when the bot stopped here. */
  pausedAt?: string | null;
  /** `conversations.ai_handoff_summary` — note the bot left on handoff. */
  handoffSummary?: string | null;
  /** Current assignee; when a human owns the thread the bot won't run. */
  assignedAgentId?: string | null;
  /** The acting agent — "Take over" assigns the thread to them. */
  currentUserId?: string | null;
  /** Called after a successful toggle so the parent can patch its local
   *  conversation state (the realtime UPDATE also arrives, but this keeps
   *  the banner instant). */
  onChange?: (patch: {
    ai_autoreply_disabled: boolean;
    assigned_agent_id?: string | null;
  }) => void;
}

const REASON_LABEL_KEY: Record<AiPauseReason, string> = {
  handoff: "reasonHandoff",
  empty_response: "reasonEmptyResponse",
  quota: "reasonQuota",
  provider_error: "reasonProviderError",
  manual: "reasonManual",
};

/**
 * Inbox banner that surfaces + controls the AI auto-reply bot per
 * conversation:
 *   - bot active here → "AI is replying automatically" + [Take over]
 *   - a human owns / the model handed off → "Handed off" + [Resume AI]
 *   - paused by a provider/quota/empty reply → the reason + [Resume AI]
 * Renders nothing when the account has no auto-reply configured.
 */
export function AiThreadBanner({
  conversationId,
  disabled,
  pauseReason,
  pausedAt,
  handoffSummary,
  assignedAgentId,
  currentUserId,
  onChange,
}: AiThreadBannerProps) {
  const t = useTranslations("Inbox.aiBanner");
  const { accountId } = useAuth();
  const [autoReplyOn, setAutoReplyOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  // Optimistic local mirror of the pause flag so the banner flips
  // instantly on click; re-seeds whenever the thread (or its server
  // state via realtime) changes.
  const [paused, setPaused] = useState(disabled);
  useEffect(() => setPaused(disabled), [conversationId, disabled]);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    fetchAiAccountStatus(accountId).then((s) => alive && setAutoReplyOn(s.autoReplyOn));
    return () => {
      alive = false;
    };
  }, [accountId]);

  const toggle = useCallback(
    async (paused: boolean) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/ai/autoreply/${conversationId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // "Take over" also assigns the thread to the acting agent.
          body: JSON.stringify({ paused, assign_to_me: paused }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast.error(j?.error ?? t("updateError"));
          return;
        }
        setPaused(paused);
        onChange?.({
          ai_autoreply_disabled: paused,
          // Take over assigns to the acting agent; resume releases only
          // the caller's own assignment. The realtime UPDATE reconciles
          // the exact value either way.
          ...(paused
            ? currentUserId
              ? { assigned_agent_id: currentUserId }
              : {}
            : { assigned_agent_id: null }),
        });
        toast.success(paused ? t("tookOver") : t("resumed"));
      } catch {
        toast.error(t("networkError"));
      } finally {
        setBusy(false);
      }
    },
    [conversationId, currentUserId, onChange, t],
  );

  // Account has no auto-reply → nothing to show. (Still loading → nothing.)
  if (!autoReplyOn) return null;

  const humanOwned = !!assignedAgentId || (!paused && pauseReason === "handoff");
  const reasonLabel = pauseReason ? t(REASON_LABEL_KEY[pauseReason]) : null;
  const detail = handoffSummary?.trim() || reasonLabel;
  const pausedLabel =
    pausedAt && !Number.isNaN(Date.parse(pausedAt))
      ? t("pausedAt", {
          when: new Date(pausedAt).toLocaleString(undefined, {
            dateStyle: "short",
            timeStyle: "short",
          }),
        })
      : null;

  // A human owns the thread (took over, or the model handed off).
  if (humanOwned) {
    return (
      <Banner tone="warning">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Hand className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
            {t("handedOffTitle")}
          </p>
          {detail && (
            <p className="truncate text-muted-foreground" title={detail}>
              {detail}
              {pausedLabel ? ` · ${pausedLabel}` : ""}
            </p>
          )}
        </div>
        <BannerButton onClick={() => toggle(false)} busy={busy} icon={Undo2}>
          {t("resume")}
        </BannerButton>
      </Banner>
    );
  }

  // Paused by the bot itself (empty response, provider/quota failure, or
  // an explicit manual pause with no assignee).
  if (paused) {
    return (
      <Banner tone="muted">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <PauseCircle className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            {t("pausedTitle")}
          </p>
          {(detail || pausedLabel) && (
            <p
              className="truncate text-muted-foreground"
              title={[detail, pausedLabel].filter(Boolean).join(" · ")}
            >
              {[detail, pausedLabel].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <BannerButton onClick={() => toggle(false)} busy={busy} icon={Undo2}>
          {t("resume")}
        </BannerButton>
      </Banner>
    );
  }

  // Active on this thread.
  return (
    <Banner tone="primary">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <span className="truncate font-medium text-foreground">
          {t("activeText")}
        </span>
      </div>
      <BannerButton onClick={() => toggle(true)} busy={busy} icon={Hand}>
        {t("takeOver")}
      </BannerButton>
    </Banner>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "primary" | "muted" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b px-3 py-2 text-xs sm:px-4",
        tone === "primary"
          ? "border-primary/20 bg-primary/5"
          : tone === "warning"
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-border bg-muted/40",
      )}
    >
      {children}
    </div>
  );
}

function BannerButton({
  onClick,
  busy,
  icon: Icon,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  icon: typeof Hand;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {children}
    </button>
  );
}
