"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import type { Channel, Pipeline, PipelineStage } from "@/types";
import {
  buildStageUpdateRows,
  reconcileStages,
  sortByPosition,
} from "@/lib/pipelines/stage-sync";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Plus,
  GripVertical,
  AlertTriangle,
  GitBranch,
  Layers3,
  Settings2,
  Search,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

const STAGE_COLORS = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
];

interface PipelineSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
  pipelines: Pipeline[];
  channels: Channel[];
  onSelectPipeline: (id: string) => void;
  stages: PipelineStage[];
  onPipelinesChanged: () => void;
  onStagesChanged: () => void;
  onCreateNewPipeline: () => void;
}

export function PipelineSettings({
  open,
  onOpenChange,
  pipeline,
  pipelines,
  channels,
  onSelectPipeline,
  stages,
  onPipelinesChanged,
  onStagesChanged,
  onCreateNewPipeline,
}: PipelineSettingsProps) {
  const t = useTranslations("Pipelines.settings");
  const supabase = createClient();

  const [name, setName] = useState(pipeline.name);
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [channelId, setChannelId] = useState(pipeline.channel_id ?? "");
  const [localStages, setLocalStages] = useState<PipelineStage[]>(stages);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const wasOpen = useRef(false);
  const pipelineIdRef = useRef(pipeline.id);

  // Reset form state when the dialog opens or its prop inputs change
  // — legitimate prop-driven sync.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (pipelineIdRef.current !== pipeline.id) {
      pipelineIdRef.current = pipeline.id;
      setName(pipeline.name);
      setChannelId(pipeline.channel_id ?? "");
      setLocalStages(sortByPosition(stages));
      setShowDeleteConfirm(false);
      return;
    }
    if (wasOpen.current) {
      setLocalStages((current) => reconcileStages(current, stages));
      return;
    }
    wasOpen.current = true;
    setName(pipeline.name);
    setChannelId(pipeline.channel_id ?? "");
    setLocalStages(sortByPosition(stages));
    setShowDeleteConfirm(false);
  }, [open, pipeline, stages]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredPipelines = useMemo(() => {
    const query = pipelineSearch.trim().toLocaleLowerCase();
    if (!query) return pipelines;
    return pipelines.filter((item) => {
      const channel = channels.find((ch) => ch.id === item.channel_id);
      return [item.name, channel?.name ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [channels, pipelineSearch, pipelines]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localStages.findIndex((s) => s.id === active.id);
    const newIndex = localStages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setLocalStages(arrayMove(localStages, oldIndex, newIndex));
  }

  async function handleSave() {
    setSaving(true);

    const existing = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipeline.id);
    if (existing.error) {
      setSaving(false);
      toast.error(t("toastFailedSave"));
      return;
    }
    const existingIds = new Set((existing.data ?? []).map((row) => row.id as string));

    // One upsert for all stages — batches N stage writes into a single
    // round-trip. Previous implementation did N sequential UPDATEs which
    // latency-scaled linearly with stage count.
    const stageRows = buildStageUpdateRows(localStages, existingIds);

    const [renameRes, stagesRes] = await Promise.all([
      supabase
        .from("pipelines")
        .update({ name: name.trim(), channel_id: channelId || null })
        .eq("id", pipeline.id),
      supabase.from("pipeline_stages").upsert(stageRows, { onConflict: "id" }),
    ]);

    setSaving(false);

    if (renameRes.error || stagesRes.error) {
      toast.error(t("toastFailedSave"));
      return;
    }

    onOpenChange(false);
    onPipelinesChanged();
    onStagesChanged();
    toast.success(t("toastSaved"));
  }

  async function handleAddStage() {
    const trimmed = newStageName.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({
        pipeline_id: pipeline.id,
        name: trimmed,
        color: newStageColor,
        position: localStages.length,
      })
      .select()
      .single();
    if (error || !data) {
      toast.error(t("toastFailedAddStage"));
      return;
    }
    setLocalStages((current) => [...current, data as PipelineStage]);
    setNewStageName("");
    setNewStageColor(STAGE_COLORS[(localStages.length + 1) % STAGE_COLORS.length]);
    onStagesChanged();
  }

  async function handleRemoveStage(stageId: string) {
    // Refuse to delete if deals still reference the stage (FK would fail).
    const { count } = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stageId);
    if (count && count > 0) {
      toast.error(t("toastMoveOrDeleteDeals"));
      return;
    }
    const { error } = await supabase
      .from("pipeline_stages")
      .delete()
      .eq("id", stageId);
    if (error) {
      toast.error(t("toastFailedDeleteStage"));
      return;
    }
    setLocalStages((current) => current.filter((s) => s.id !== stageId));
    onStagesChanged();
  }

  async function handleDeletePipeline() {
    setDeleting(true);
    // ON DELETE CASCADE handles deals + stages.
    const { error } = await supabase
      .from("pipelines")
      .delete()
      .eq("id", pipeline.id);
    setDeleting(false);
    if (error) {
      toast.error(t("toastFailedDeletePipeline"));
      return;
    }
    onOpenChange(false);
    onPipelinesChanged();
    toast.success(t("toastDeleted"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] flex-col gap-0 overflow-hidden border-border bg-popover p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GitBranch className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-popover-foreground">
                {t("managePipeline")}
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("generalDesc")}</p>
            </div>
          </div>
        </DialogHeader>

        {showDeleteConfirm ? (
          <div className="p-6">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-semibold text-red-400">
                    {t("deletePipeline")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("deletePipelineDesc")}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                className="border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleDeletePipeline}
                disabled={deleting}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleting ? t("deleting") : t("deletePipelineBtn")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="flex min-h-0 flex-col border-b border-border bg-card/40 p-4 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {t("allPipelines")}
                  </p>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {pipelines.length}
                  </span>
                </div>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={pipelineSearch}
                    onChange={(event) => setPipelineSearch(event.target.value)}
                    placeholder={t("searchPipelines")}
                    className="h-8 border-border bg-background pl-8 text-xs"
                  />
                </div>
                <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {filteredPipelines.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      {t("noPipelinesFound")}
                    </p>
                  ) : (
                    filteredPipelines.map((item) => {
                      const itemChannel = channels.find(
                        (channel) => channel.id === item.channel_id,
                      );
                      const active = item.id === pipeline.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectPipeline(item.id)}
                          className={
                            active
                              ? "w-full rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-left"
                              : "w-full rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/60"
                          }
                        >
                          <span className="block truncate text-sm font-medium text-foreground">
                            {item.name}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                            <MessageSquare className="h-2.5 w-2.5 shrink-0" />
                            {itemChannel?.name ?? t("noChannel")}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={onCreateNewPipeline}
                  className="mt-3 w-full justify-start gap-1.5 border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("createNewPipeline")}
                </Button>
              </aside>

              <div className="grid min-h-0 gap-5 overflow-y-auto p-6 xl:grid-cols-[340px_minmax(0,1fr)]">
              <div className="space-y-4">
                <section className="rounded-xl border border-border bg-card/60 p-4">
                  <div className="mb-4 flex items-start gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Settings2 className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {t("generalTitle")}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("generalDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label className="text-muted-foreground">{t("pipelineName")}</Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="border-border bg-muted text-foreground"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-muted-foreground">{t("channel")}</Label>
                      <Select
                        value={channelId || "__none__"}
                        onValueChange={(value) =>
                          setChannelId(value === "__none__" ? "" : (value ?? ""))
                        }
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground">
                          <SelectValue placeholder={t("noChannel")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t("noChannel")}</SelectItem>
                          {channels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                              {channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">{t("channelHint")}</p>
                    </div>
                  </div>
                </section>

                <button
                  type="button"
                  onClick={onCreateNewPipeline}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-card/30 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {t("createNewPipeline")}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t("createNewPipelineDesc")}
                    </span>
                  </span>
                </button>
              </div>

              <section className="rounded-xl border border-border bg-card/60 p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Layers3 className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {t("stages")}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("stagesDesc")}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t("stageCount", { count: localStages.length })}
                  </span>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleReorder}
                >
                  <SortableContext
                    items={localStages.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {localStages.map((stage, index) => (
                        <SortableStageRow
                          key={stage.id}
                          stage={stage}
                          index={index}
                          onNameChange={(v) => {
                            const updated = [...localStages];
                            updated[index] = { ...updated[index], name: v };
                            setLocalStages(updated);
                          }}
                          onColorChange={(v) => {
                            const updated = [...localStages];
                            updated[index] = { ...updated[index], color: v };
                            setLocalStages(updated);
                          }}
                          onRemove={() => handleRemoveStage(stage.id)}
                          colors={STAGE_COLORS}
                          t={t}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                <div className="mt-4 rounded-xl border border-dashed border-border bg-background/40 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("newStageNamePlaceholder")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {STAGE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewStageColor(color)}
                        className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor:
                            newStageColor === color
                              ? "var(--foreground)"
                              : "transparent",
                        }}
                        aria-label={t("pickColor", { color })}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={newStageName}
                      onChange={(e) => setNewStageName(e.target.value)}
                      placeholder={t("newStageNamePlaceholder")}
                      className="border-border bg-muted text-sm text-foreground"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddStage();
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddStage}
                      disabled={!newStageName.trim()}
                      className="shrink-0 border-border bg-transparent text-muted-foreground hover:bg-muted"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {t("add")}
                    </Button>
                  </div>
                </div>
              </section>
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                className="mr-auto bg-red-600 text-white hover:bg-red-700"
              >
                {t("deletePipeline")}
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? t("saving") : t("saveChanges")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SortableStageRow({
  stage,
  index,
  onNameChange,
  onColorChange,
  onRemove,
  colors,
  t,
}: {
  stage: PipelineStage;
  index: number;
  onNameChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onRemove: () => void;
  colors: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/40"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={t("dragToReorder")}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <ColorSwatch value={stage.color} onChange={onColorChange} colors={colors} t={t} />
      <div className="min-w-0 flex-1">
        <Input
          value={stage.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="h-7 border-transparent bg-transparent px-1 text-sm font-medium text-foreground focus:border-border"
        />
        <p className="px-1 text-[10px] text-muted-foreground">
          {t("stagePosition", { position: index + 1 })}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        className="text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ColorSwatch({
  value,
  onChange,
  colors,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-4 w-4 rounded-full border border-border"
        style={{ backgroundColor: value }}
        aria-label={t("changeColor")}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 flex flex-wrap gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg w-36">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor:
                    c === value ? "var(--foreground)" : "transparent",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
