"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Channel, Deal, Pipeline, PipelineStage } from "@/types";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { DealForm } from "@/components/pipelines/deal-form";
import { DealDetailSheet } from "@/components/pipelines/deal-detail-sheet";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import { PipelineHealth } from "@/components/pipelines/pipeline-health";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, GitBranch, Plus, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { GatedButton } from "@/components/ui/gated-button";
import { useTranslations } from "next-intl";

export default function PipelinesPage() {
  const t = useTranslations("Pipelines.page");
  const tGate = useTranslations("GatedButton");
  const supabase = createClient();
  const router = useRouter();
  const canCreateDeals = useCan("send-messages");

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [detailDeal, setDetailDeal] = useState<Deal | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState("");

  const loadPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .order("created_at");
    if (error) {
      console.error("Failed to load pipelines:", error.message);
      return [];
    }
    return (data ?? []) as Pipeline[];
  }, [supabase]);

  const loadChannels = useCallback(async () => {
    const { data, error } = await supabase
      .from("channels")
      .select("id, name, color, department_id")
      .order("name");
    if (error) {
      console.error("Failed to load channels:", error.message);
      return [];
    }
    return (data ?? []) as Channel[];
  }, [supabase]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      return (data ?? []) as PipelineStage[];
    },
    [supabase],
  );

  const loadDeals = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("deals")
        .select(
          "*, contact:contacts(*), assignee:profiles!deals_assigned_to_fkey(*)",
        )
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Deal[];
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [list, channelRows] = await Promise.all([
        loadPipelines(),
        loadChannels(),
      ]);
      if (cancelled) return;
      setPipelines(list);
      setChannels(channelRows);
      if (list.length > 0) {
        setSelectedPipelineId((prev) =>
          prev && list.some((pipeline) => pipeline.id === prev)
            ? prev
            : list[0].id,
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, loadChannels]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (pipelines.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("pipeline");
    if (requested && pipelines.some((pipeline) => pipeline.id === requested)) {
      setSelectedPipelineId(requested);
    }
  }, [pipelines]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!selectedPipelineId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStages([]);
      setDeals([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [stageRows, dealRows] = await Promise.all([
        loadStages(selectedPipelineId),
        loadDeals(selectedPipelineId),
      ]);
      if (cancelled) return;
      setStages(stageRows);
      setDeals(dealRows);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPipelineId, loadStages, loadDeals]);

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setDeals(await loadDeals(selectedPipelineId));
  }, [loadDeals, selectedPipelineId]);

  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      const deal = deals.find((item) => item.id === dealId);
      const sortedStages = [...stages].sort((a, b) => a.position - b.position);
      const winningStageId = sortedStages.at(-1)?.id ?? null;
      const isWinning = winningStageId === newStageId;
      const nextStatus =
        isWinning
          ? "won"
          : deal?.status === "won"
            ? "open"
            : undefined;

      setDeals((prev) =>
        prev.map((item) =>
          item.id === dealId
            ? {
                ...item,
                stage_id: newStageId,
                ...(nextStatus ? { status: nextStatus } : {}),
              }
            : item,
        ),
      );

      const { error } = await supabase
        .from("deals")
        .update({
          stage_id: newStageId,
          ...(nextStatus ? { status: nextStatus } : {}),
        })
        .eq("id", dealId);

      if (error) {
        toast.error(t("toastFailedMoveDeal"));
        refreshDeals();
        return;
      }

      if (!isWinning || !deal) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      let conversationId = deal.conversation_id ?? null;
      if (!conversationId && deal.contact_id) {
        const { data: conversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", deal.contact_id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        conversationId = conversation?.id ?? null;
      }

      if (conversationId) {
        const { error: closeError } = await supabase
          .from("conversations")
          .update({
            status: "closed",
            closed_by_user_id: user?.id ?? null,
          })
          .eq("id", conversationId);
        if (closeError) {
          console.error(
            "Failed to finalize conversation after winning deal:",
            closeError.message,
          );
        }
      }
    },
    [deals, stages, supabase, refreshDeals, t],
  );

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? stages[0]?.id ?? "");
      setDealFormOpen(true);
    },
    [stages],
  );

  const handleEditDeal = useCallback((deal: Deal) => {
    setEditingDeal(deal);
    setDefaultStageId(deal.stage_id);
    setDealFormOpen(true);
  }, []);

  const handleOpenDeal = useCallback((deal: Deal) => {
    setDetailDeal(deal);
    setDetailOpen(true);
  }, []);

  const handleOpenDealChat = useCallback(
    async (deal: Deal) => {
      if (deal.conversation_id) {
        router.push(`/inbox?c=${deal.conversation_id}`);
        return;
      }
      if (!deal.contact_id) {
        toast.error(t("toastNoConversation"));
        return;
      }
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", deal.contact_id)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.id) router.push(`/inbox?c=${data.id}`);
      else toast.error(t("toastNoConversation"));
    },
    [router, supabase, t],
  );

  const filteredDeals = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return deals;
    return deals.filter((deal) => {
      const haystack = [
        deal.title,
        deal.contact?.name ?? "",
        deal.contact?.phone ?? "",
        deal.contact?.company ?? "",
        deal.assignee?.full_name ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(query);
    });
  }, [deals, search]);

  const selectedPipeline = pipelines.find(
    (pipeline) => pipeline.id === selectedPipelineId,
  );
  const selectedChannel = channels.find(
    (channel) => channel.id === selectedPipeline?.channel_id,
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="h-10 w-56 animate-pulse rounded-xl bg-muted" />
          <div className="h-8 w-36 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-14 animate-pulse rounded-xl bg-muted/50" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex gap-3 overflow-hidden rounded-xl bg-muted/20 p-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-96 w-64 animate-pulse rounded-xl bg-muted/50"
              />
            ))}
          </div>
          <div className="hidden h-96 animate-pulse rounded-xl bg-muted/40 2xl:block" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <GitBranch className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {t("title")}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/settings?tab=pipelines")}
            className="gap-1.5"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t("configurePipeline")}
          </Button>
          <GatedButton
            canAct={canCreateDeals}
            gateReason={tGate("reasons.createDeals")}
            disabled={!selectedPipelineId || stages.length === 0}
            onClick={() => handleAddDeal()}
            size="sm"
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addDeal")}
          </GatedButton>
        </div>
      </div>

      {pipelines.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted data-[popup-open]:bg-muted">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <GitBranch className="h-3 w-3" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {t("pipelineLabel")}
                </span>
                <span className="block max-w-[180px] truncate font-semibold">
                  {selectedPipeline?.name ?? t("selectPipeline")}
                </span>
              </span>
              <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-72 border-border bg-popover text-popover-foreground"
            >
              {pipelines.map((pipeline) => {
                const pipelineChannel = channels.find(
                  (channel) => channel.id === pipeline.channel_id,
                );
                return (
                  <DropdownMenuItem
                    key={pipeline.id}
                    onClick={() => setSelectedPipelineId(pipeline.id)}
                    className={
                      pipeline.id === selectedPipelineId
                        ? "text-primary"
                        : "text-popover-foreground"
                    }
                  >
                    <GitBranch className="mr-2 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{pipeline.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {pipelineChannel?.name ?? t("allChannels")}
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {selectedChannel && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: selectedChannel.color }}
              />
              <span className="max-w-[140px] truncate">
                {selectedChannel.name}
              </span>
            </span>
          )}

          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchDeals")}
              className="h-8 bg-background pl-8 text-xs"
            />
          </div>

          {search.trim() && (
            <span className="text-[10px] text-muted-foreground">
              {t("searchResults", { count: filteredDeals.length })}
            </span>
          )}
        </div>
      )}

      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <GitBranch className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            {t("noPipelinesYet")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("createToStartTracking")}
          </p>
          <Button
            onClick={() => router.push("/settings?tab=pipelines")}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <GitBranch className="mr-1 h-4 w-4" />
            {t("managePipelines")}
          </Button>
        </div>
      ) : (
        <>
          <PipelineAnalytics deals={deals} />
          <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
            <div className="min-w-0 rounded-xl border border-border bg-card/35 p-2.5">
              <PipelineBoard
                stages={stages}
                deals={filteredDeals}
                onDealMoved={handleDealMoved}
                onAddDeal={handleAddDeal}
                onEditDeal={handleOpenDeal}
                onOpenChat={handleOpenDealChat}
              />
            </div>
            <div className="2xl:sticky 2xl:top-4">
              <PipelineHealth deals={deals} stages={stages} />
            </div>
          </div>
        </>
      )}

      <DealDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        deal={detailDeal}
        pipeline={selectedPipeline}
        stages={stages}
        onEdit={(deal) => {
          setDetailOpen(false);
          handleEditDeal(deal);
        }}
      />

      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={selectedPipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        onSaved={refreshDeals}
      />
    </div>
  );
}
