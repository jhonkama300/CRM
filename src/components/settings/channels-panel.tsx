"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCan } from "@/hooks/use-can";
import type { Channel, Department } from "@/types";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Loader2, MessageCircle, Pencil, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmbeddedSignupButton } from "@/components/settings/embedded-signup-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  name: "",
  color: "#25D366",
  phone_number_id: "",
  waba_id: "",
  access_token: "",
  verify_token: "",
  pin: "",
  department_id: null,
};

export function ChannelsPanel() {
  const t = useTranslations("Settings.channels");
  const canEdit = useCan("edit-settings");
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [channelRes, deptRes] = await Promise.all([
      fetch("/api/channels", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { channels: [] },
      ),
      supabase.from("departments").select("*").order("name"),
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
      waba_id: channel.waba_id ?? "",
      access_token: "",
      verify_token: "",
      pin: "",
      department_id: channel.department_id,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.phone_number_id.trim()) {
      toast.error(t("requiredFields"));
      return;
    }
    if (!editing && !draft.access_token.trim()) {
      toast.error(t("tokenRequired"));
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
      if (draft.access_token.trim()) body.access_token = draft.access_token.trim();
      if (draft.pin.trim()) body.pin = draft.pin.trim();
      if (!editing) body.phone_number_id = draft.phone_number_id.trim();

      const res = await fetch(
        editing ? `/api/channels/${editing.id}` : "/api/channels",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? t("saveFailed"));
        await fetchData();
        return;
      }
      toast.success(editing ? t("updated") : t("created"));
      setDialogOpen(false);
      await fetchData();
    } catch {
      toast.error(t("networkError"));
    } finally {
      setSaving(false);
    }
  };

  const testChannel = async (channel: Channel) => {
    setTestingId(channel.id);
    try {
      const res = await fetch(`/api/channels/${channel.id}/test`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? t("testFailed"));
      } else {
        toast.success(t("testOk"));
      }
      await fetchData();
    } catch {
      toast.error(t("networkError"));
    } finally {
      setTestingId(null);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/channels/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? t("deleteFailed"));
        return;
      }
      toast.success(t("deleted"));
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
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <EmbeddedSignupButton onConnected={() => void fetchData()} />
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("addChannel")}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center rounded-xl border border-border py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <MessageCircle className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">{t("empty")}</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {t("emptyDesc")}
          </p>
          {canEdit && (
            <Button onClick={openCreate} className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" />
              {t("addChannel")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {channels.map((channel) => {
            const department = departments.find(
              (d) => d.id === channel.department_id,
            );
            return (
              <div
                key={channel.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: channel.color }}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {channel.name}
                      </p>
                      {channel.source_config_id && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
                          <Star className="h-2.5 w-2.5" />
                          {t("primary")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {channel.display_phone_number || channel.phone_number_id}
                      {department ? ` · ${department.name}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      WABA: {channel.waba_id || "-"} · {channel.status}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                          channel.quality_rating === "GREEN"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : channel.quality_rating === "YELLOW"
                              ? "bg-amber-500/10 text-amber-500"
                              : channel.quality_rating === "RED"
                                ? "bg-red-500/10 text-red-500"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t("quality")}: {channel.quality_rating || "UNKNOWN"}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                          channel.registered_at
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-amber-500/10 text-amber-500"
                        }`}
                      >
                        {channel.registered_at
                          ? t("registered")
                          : t("notRegistered")}
                      </span>
                      {channel.messaging_limit && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
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
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {t("lastChecked")}:{" "}
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
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        title={t("test")}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${testingId === channel.id ? "animate-spin" : ""}`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(channel)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={t("edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(channel)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        title={t("delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("newTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>{t("name")}</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="bg-muted border-border text-foreground"
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("department")}</Label>
              <Select
                value={draft.department_id ?? "__none__"}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    department_id: v === "__none__" ? null : (v ?? null),
                  }))
                }
              >
                <SelectTrigger className="bg-muted border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("noDepartment")}</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("phoneNumberId")}</Label>
                <Input
                  value={draft.phone_number_id}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, phone_number_id: e.target.value }))
                  }
                  className="bg-muted border-border text-foreground"
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("wabaId")}</Label>
                <Input
                  value={draft.waba_id}
                  onChange={(e) => setDraft((d) => ({ ...d, waba_id: e.target.value }))}
                  className="bg-muted border-border text-foreground"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                {editing ? t("accessTokenKeep") : t("accessToken")}
              </Label>
              <Input
                type="password"
                value={draft.access_token}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, access_token: e.target.value }))
                }
                className="bg-muted border-border text-foreground"
                placeholder={editing ? t("accessTokenKeepPlaceholder") : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("verifyToken")}</Label>
              <Input
                value={draft.verify_token}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, verify_token: e.target.value }))
                }
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("pin")}</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={draft.pin}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    pin: e.target.value.replace(/\D/g, "").slice(0, 6),
                  }))
                }
                className="bg-muted border-border text-foreground"
                placeholder={t("pinPlaceholder")}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("pinHint")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("color")}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="h-8 w-10 rounded border border-border bg-muted"
                />
                <Input
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="bg-muted border-border font-mono text-foreground"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDesc", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
