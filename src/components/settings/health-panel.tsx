"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HealthData {
  whatsapp: { configured: boolean; connected: boolean; channels: number; failed: number };
  ai: {
    configured: boolean;
    active: boolean;
    autoReply: boolean;
    provider?: string;
    model?: string;
  };
  cron: { configured: boolean };
  siteUrl: string | null;
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

export function HealthPanel() {
  const t = useTranslations("Settings.health");
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health/operational", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? t("loadFailed"));
        return;
      }
      setData(json as HealthData);
    } catch {
      toast.error(t("networkError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center rounded-xl border border-border py-16">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const items = data
    ? [
        {
          id: "whatsapp",
          label: t("whatsapp"),
          ok: data.whatsapp.configured && data.whatsapp.connected,
          detail: !data.whatsapp.configured
            ? t("notConfigured")
            : data.whatsapp.connected
              ? t("channelsConnected", { count: data.whatsapp.channels })
              : t("disconnected"),
          icon: MessageCircle,
        },
        {
          id: "ai",
          label: t("ai"),
          ok: data.ai.configured && data.ai.active,
          detail: data.ai.configured
            ? `${data.ai.provider} · ${data.ai.model}${data.ai.autoReply ? " · auto-reply" : ""}`
            : t("notConfigured"),
          icon: Sparkles,
        },
        {
          id: "cron",
          label: t("cron"),
          ok: data.cron.configured,
          detail: data.cron.configured ? t("configured") : t("notConfigured"),
          icon: Clock3,
        },
        {
          id: "site",
          label: t("siteUrl"),
          ok: !!data.siteUrl,
          detail: data.siteUrl ?? t("notConfigured"),
          icon: RefreshCw,
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          {t("refresh")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.id}>
              <CardContent className="flex items-start gap-3 pt-4">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    item.ok
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-amber-500/10 text-amber-500",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground">
                      {item.label}
                    </p>
                    {item.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {data && data.channels.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-medium text-foreground">
              {t("channels")}
            </p>
            <div className="space-y-2">
              {data.channels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {channel.name}
                      <span className="ml-2 text-[10px] font-normal uppercase text-muted-foreground">
                        {channel.quality_rating ?? t("unknown")}
                        {" · "}
                        {channel.registered_at ? t("registered") : t("notRegistered")}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {channel.display_phone_number
                        ? `${channel.display_phone_number} · `
                        : ""}
                      {channel.last_error
                        ? channel.last_error
                        : channel.last_checked_at
                          ? `${t("lastChecked")}: ${new Date(channel.last_checked_at).toLocaleString()}`
                          : t("neverChecked")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                      channel.status === "connected"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-amber-500/10 text-amber-500",
                    )}
                  >
                    {channel.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
