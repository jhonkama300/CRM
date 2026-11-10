'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createClient } from '@/lib/supabase/client';
import type {
  Channel,
  Department,
  Pipeline,
  PipelineClosingOutcome,
  PipelineStage,
  PipelineStageType,
} from '@/types';
import {
  buildStageUpdateRows,
  reconcileStages,
  sortByPosition,
} from '@/lib/pipelines/stage-sync';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Trash2,
  Plus,
  GripVertical,
  AlertTriangle,
  GitBranch,
  Layers3,
  Settings2,
  Search,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { WhatsAppIcon } from '@/components/icons/whatsapp-icon';

const STAGE_COLORS = [
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
];

interface PipelineSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
  pipelines: Pipeline[];
  channels: Channel[];
  departments: Department[];
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
  departments,
  onSelectPipeline,
  stages,
  onPipelinesChanged,
  onStagesChanged,
  onCreateNewPipeline,
}: PipelineSettingsProps) {
  const t = useTranslations('Pipelines.settings');
  const supabase = createClient();

  const [name, setName] = useState(pipeline.name);
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [channelId, setChannelId] = useState(pipeline.channel_id ?? '');
  const [departmentId, setDepartmentId] = useState(
    channels.find((channel) => channel.id === pipeline.channel_id)
      ?.department_id ?? ''
  );
  const selectedChannel = channels.find((channel) => channel.id === channelId);
  const [localStages, setLocalStages] = useState<PipelineStage[]>(stages);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
  const [newStageType, setNewStageType] = useState<PipelineStageType>('progress');
  const [newStageOutcome, setNewStageOutcome] =
    useState<PipelineClosingOutcome>('won');
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
      setChannelId(pipeline.channel_id ?? '');
      setDepartmentId(
        channels.find((channel) => channel.id === pipeline.channel_id)
          ?.department_id ?? ''
      );
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
    setChannelId(pipeline.channel_id ?? '');
    setDepartmentId(
      channels.find((channel) => channel.id === pipeline.channel_id)
        ?.department_id ?? ''
    );
    setLocalStages(sortByPosition(stages));
    setShowDeleteConfirm(false);
  }, [open, pipeline, stages, channels]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredPipelines = useMemo(() => {
    const query = pipelineSearch.trim().toLocaleLowerCase();
    if (!query) return pipelines;
    return pipelines.filter((item) => {
      const channel = channels.find((ch) => ch.id === item.channel_id);
      return [item.name, channel?.name ?? '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [channels, pipelineSearch, pipelines]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
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
    if (!localStages.some((stage) => stage.stage_type === 'start')) {
      toast.error(t('toastNeedsStart'));
      return;
    }
    setSaving(true);

    const existing = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipeline.id);
    if (existing.error) {
      setSaving(false);
      toast.error(t('toastFailedSave'));
      return;
    }
    const existingIds = new Set(
      (existing.data ?? []).map((row) => row.id as string)
    );

    // One upsert for all stages — batches N stage writes into a single
    // round-trip. Previous implementation did N sequential UPDATEs which
    // latency-scaled linearly with stage count.
    const stageRows = buildStageUpdateRows(localStages, existingIds);

    const [renameRes, stagesRes, channelRes] = await Promise.all([
      supabase
        .from('pipelines')
        .update({ name: name.trim(), channel_id: channelId || null })
        .eq('id', pipeline.id),
      supabase.from('pipeline_stages').upsert(stageRows, { onConflict: 'id' }),
      channelId
        ? supabase
            .from('channels')
            .update({ department_id: departmentId || null })
            .eq('id', channelId)
        : Promise.resolve({ error: null }),
    ]);

    setSaving(false);

    if (renameRes.error || stagesRes.error || channelRes.error) {
      toast.error(t('toastFailedSave'));
      return;
    }

    onOpenChange(false);
    onPipelinesChanged();
    onStagesChanged();
    toast.success(t('toastSaved'));
  }

  async function handleAddStage() {
    const trimmed = newStageName.trim();
    if (!trimmed) return;
    if (
      newStageType === 'start' &&
      localStages.some((stage) => stage.stage_type === 'start')
    ) {
      toast.error(t('toastOnlyOneStart'));
      return;
    }
    const { data, error } = await supabase
      .from('pipeline_stages')
      .insert({
        pipeline_id: pipeline.id,
        name: trimmed,
        color: newStageColor,
        position: localStages.length,
        stage_type: newStageType,
        closing_outcome: newStageType === 'closing' ? newStageOutcome : null,
      })
      .select()
      .single();
    if (error || !data) {
      toast.error(t('toastFailedAddStage'));
      return;
    }
    setLocalStages((current) => [...current, data as PipelineStage]);
    setNewStageName('');
    setNewStageColor(
      STAGE_COLORS[(localStages.length + 1) % STAGE_COLORS.length]
    );
    setNewStageType('progress');
    setNewStageOutcome('won');
    onStagesChanged();
  }

  async function handleRemoveStage(stageId: string) {
    const target = localStages.find((stage) => stage.id === stageId);
    if (
      target?.stage_type === 'start' &&
      !localStages.some(
        (stage) => stage.stage_type === 'start' && stage.id !== stageId,
      )
    ) {
      toast.error(t('toastNeedsStart'));
      return;
    }
    // Refuse to delete if deals still reference the stage (FK would fail).
    const { count } = await supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('stage_id', stageId);
    if (count && count > 0) {
      toast.error(t('toastMoveOrDeleteDeals'));
      return;
    }
    const { error } = await supabase
      .from('pipeline_stages')
      .delete()
      .eq('id', stageId);
    if (error) {
      toast.error(t('toastFailedDeleteStage'));
      return;
    }
    setLocalStages((current) => current.filter((s) => s.id !== stageId));
    onStagesChanged();
  }

  async function handleDeletePipeline() {
    setDeleting(true);
    // ON DELETE CASCADE handles deals + stages.
    const { error } = await supabase
      .from('pipelines')
      .delete()
      .eq('id', pipeline.id);
    setDeleting(false);
    if (error) {
      toast.error(t('toastFailedDeletePipeline'));
      return;
    }
    onOpenChange(false);
    onPipelinesChanged();
    toast.success(t('toastDeleted'));
  }

  const channelOptions = [
    { value: '__none__', label: t('noChannel') },
    ...channels.map((channel) => ({
      value: channel.id,
      label: channel.department?.name
        ? `${channel.name} · ${channel.department.name}`
        : channel.name,
    })),
  ];
  const departmentOptions = [
    { value: '__none__', label: t('noDepartment') },
    ...departments.map((department) => ({
      value: department.id,
      label: department.name,
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover flex h-[85vh] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-border from-primary/[0.08] via-popover to-popover shrink-0 border-b bg-gradient-to-r px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary ring-primary/20 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1">
              <GitBranch className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-popover-foreground text-lg">
                  {t('managePipeline')}
                </DialogTitle>
                <span className="border-border bg-background/70 text-muted-foreground max-w-56 truncate rounded-full border px-2.5 py-0.5 text-[10px] font-medium">
                  {pipeline.name}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('generalDesc')}
              </p>
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
                    {t('deletePipeline')}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('deletePipelineDesc')}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                className="border-border text-muted-foreground hover:bg-muted bg-transparent"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleDeletePipeline}
                disabled={deleting}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleting ? t('deleting') : t('deletePipelineBtn')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="border-border bg-card/40 flex min-h-0 flex-col border-b p-4 lg:border-r lg:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
                    {t('allPipelines')}
                  </p>
                  <span className="border-border bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]">
                    {pipelines.length}
                  </span>
                </div>
                <div className="relative mt-3">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                  <Input
                    value={pipelineSearch}
                    onChange={(event) => setPipelineSearch(event.target.value)}
                    placeholder={t('searchPipelines')}
                    className="border-border bg-background h-8 pl-8 text-xs"
                  />
                </div>
                <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {filteredPipelines.length === 0 ? (
                    <p className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-xs">
                      {t('noPipelinesFound')}
                    </p>
                  ) : (
                    filteredPipelines.map((item) => {
                      const itemChannel = channels.find(
                        (channel) => channel.id === item.channel_id
                      );
                      const active = item.id === pipeline.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectPipeline(item.id)}
                          className={
                            active
                              ? 'border-primary/40 bg-primary/10 w-full rounded-xl border px-3 py-2.5 text-left'
                              : 'hover:border-border hover:bg-muted/60 w-full rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors'
                          }
                        >
                          <span className="text-foreground block truncate text-sm font-medium">
                            {item.name}
                          </span>
                          <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate text-[10px]">
                            <WhatsAppIcon
                              className="h-2.5 w-2.5 shrink-0"
                              style={{ color: itemChannel?.color }}
                            />
                            <span className="truncate">
                              {itemChannel?.name ?? t('noChannel')}
                              {itemChannel?.department?.name
                                ? ` · ${itemChannel.department.name}`
                                : ''}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={onCreateNewPipeline}
                  className="border-border text-muted-foreground hover:bg-muted mt-3 w-full justify-start gap-1.5 border-dashed bg-transparent"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('createNewPipeline')}
                </Button>
              </aside>

              <div className="grid min-h-0 gap-5 overflow-y-auto p-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <section className="border-border bg-card/60 rounded-xl border p-4">
                    <div className="mb-4 flex items-start gap-2.5">
                      <span className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                        <Settings2 className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-foreground text-sm font-semibold">
                          {t('generalTitle')}
                        </h3>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {t('generalDesc')}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label className="text-muted-foreground">
                          {t('pipelineName')}
                        </Label>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="border-border bg-muted text-foreground"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-muted-foreground">
                          {t('channel')}
                        </Label>
                        <Select
                          items={channelOptions}
                          value={channelId || '__none__'}
                          onValueChange={(value) => {
                            const nextChannelId =
                              value === '__none__' ? '' : (value ?? '');
                            setChannelId(nextChannelId);
                            setDepartmentId(
                              channels.find(
                                (channel) => channel.id === nextChannelId
                              )?.department_id ?? ''
                            );
                          }}
                        >
                          <SelectTrigger className="border-border bg-muted text-foreground w-full">
                            <SelectValue placeholder={t('noChannel')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              {t('noChannel')}
                            </SelectItem>
                            {channels.map((channel) => (
                              <SelectItem key={channel.id} value={channel.id}>
                                {channel.department?.name
                                  ? `${channel.name} · ${channel.department.name}`
                                  : channel.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-[11px]">
                          {t('channelHint')}
                        </p>
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-muted-foreground">
                          {t('department')}
                        </Label>
                        <Select
                          items={departmentOptions}
                          value={departmentId || '__none__'}
                          onValueChange={(value) =>
                            setDepartmentId(
                              value === '__none__' ? '' : (value ?? '')
                            )
                          }
                          disabled={!channelId}
                        >
                          <SelectTrigger className="border-border bg-muted text-foreground w-full">
                            <SelectValue placeholder={t('noDepartment')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              {t('noDepartment')}
                            </SelectItem>
                            {departments.map((department) => (
                              <SelectItem
                                key={department.id}
                                value={department.id}
                              >
                                {department.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-[11px]">
                          {t('departmentHint')}
                        </p>
                        {selectedChannel &&
                          (selectedChannel.department_id ?? '') !==
                            departmentId && (
                            <p className="text-[11px] text-amber-500">
                              {t('departmentChannelUpdate')}
                            </p>
                          )}
                      </div>
                    </div>

                    {selectedChannel && (
                      <div className="mt-4 rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 p-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366] ring-1 ring-[#25D366]/20">
                            <WhatsAppIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate text-xs font-semibold">
                              {selectedChannel.name}
                            </p>
                            <p className="text-muted-foreground truncate text-[11px]">
                              {selectedChannel.display_phone_number ||
                                selectedChannel.phone_number_id}
                            </p>
                          </div>
                        </div>
                        <div className="text-muted-foreground mt-2.5 flex items-center gap-1.5 text-[11px]">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {selectedChannel.department?.name ??
                              t('noDepartment')}
                          </span>
                        </div>
                      </div>
                    )}
                  </section>

                  <button
                    type="button"
                    onClick={onCreateNewPipeline}
                    className="border-border bg-card/30 hover:border-primary/40 hover:bg-primary/5 flex w-full items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left transition-colors"
                  >
                    <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                      <Plus className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="text-foreground block text-sm font-medium">
                        {t('createNewPipeline')}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {t('createNewPipelineDesc')}
                      </span>
                    </span>
                  </button>
                </div>

                <section className="border-border bg-card/60 rounded-xl border p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                        <Layers3 className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-foreground text-sm font-semibold">
                          {t('stages')}
                        </h3>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {t('stagesDesc')}
                        </p>
                      </div>
                    </div>
                    <span className="border-border bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium">
                      {t('stageCount', { count: localStages.length })}
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
                            onTypeChange={(v) => {
                              setLocalStages((current) =>
                                current.map((item) => {
                                  if (item.id === stage.id) {
                                    return {
                                      ...item,
                                      stage_type: v,
                                      closing_outcome:
                                        v === 'closing'
                                          ? (item.closing_outcome ?? 'won')
                                          : null,
                                    };
                                  }
                                  if (v === 'start' && item.stage_type === 'start') {
                                    return {
                                      ...item,
                                      stage_type: 'progress',
                                      closing_outcome: null,
                                    };
                                  }
                                  return item;
                                }),
                              );
                            }}
                            onOutcomeChange={(v) => {
                              const updated = [...localStages];
                              updated[index] = {
                                ...updated[index],
                                closing_outcome: v,
                              };
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

                  <div className="border-border bg-background/40 mt-4 rounded-xl border border-dashed p-3">
                    <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                      {t('newStageNamePlaceholder')}
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
                                ? 'var(--foreground)'
                                : 'transparent',
                          }}
                          aria-label={t('pickColor', { color })}
                        />
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Select
                        value={newStageType}
                        onValueChange={(value) =>
                          setNewStageType(value as PipelineStageType)
                        }
                      >
                        <SelectTrigger className="border-border bg-muted text-foreground h-8 text-xs">
                          <SelectValue>
                            {newStageType === 'start'
                              ? t('stageTypeStart')
                              : newStageType === 'closing'
                                ? t('stageTypeClosing')
                                : t('stageTypeProgress')}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            value="start"
                            disabled={localStages.some(
                              (stage) => stage.stage_type === 'start',
                            )}
                          >
                            {t('stageTypeStart')}
                          </SelectItem>
                          <SelectItem value="progress">
                            {t('stageTypeProgress')}
                          </SelectItem>
                          <SelectItem value="closing">
                            {t('stageTypeClosing')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {newStageType === 'closing' && (
                        <Select
                          value={newStageOutcome}
                          onValueChange={(value) =>
                            setNewStageOutcome(
                              value as PipelineClosingOutcome,
                            )
                          }
                        >
                          <SelectTrigger className="border-border bg-muted text-foreground h-8 text-xs">
                            <SelectValue>
                              {newStageOutcome === 'won'
                                ? t('outcomeWon')
                                : t('outcomeLost')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="won">
                              {t('outcomeWon')}
                            </SelectItem>
                            <SelectItem value="lost">
                              {t('outcomeLost')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        value={newStageName}
                        onChange={(e) => setNewStageName(e.target.value)}
                        placeholder={t('newStageNamePlaceholder')}
                        className="border-border bg-muted text-foreground text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddStage();
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddStage}
                        disabled={!newStageName.trim()}
                        className="border-border text-muted-foreground hover:bg-muted shrink-0 bg-transparent"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        {t('add')}
                      </Button>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <DialogFooter className="border-border shrink-0 border-t px-6 py-4">
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                className="mr-auto bg-red-600 text-white hover:bg-red-700"
              >
                {t('deletePipeline')}
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-border text-muted-foreground hover:bg-muted bg-transparent"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? t('saving') : t('saveChanges')}
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
  onTypeChange,
  onOutcomeChange,
  onRemove,
  colors,
  t,
}: {
  stage: PipelineStage;
  index: number;
  onNameChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onTypeChange: (v: PipelineStageType) => void;
  onOutcomeChange: (v: PipelineClosingOutcome) => void;
  onRemove: () => void;
  colors: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group border-border bg-card hover:border-primary/40 flex items-center gap-2.5 rounded-xl border px-3 py-2 shadow-sm transition-colors"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
        aria-label={t('dragToReorder')}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <ColorSwatch
        value={stage.color}
        onChange={onColorChange}
        colors={colors}
        t={t}
      />
      <div className="min-w-0 flex-1">
        <Input
          value={stage.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-foreground focus:border-border h-7 border-transparent bg-transparent px-1 text-sm font-medium"
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1">
          <Select
            value={stage.stage_type}
            onValueChange={(value) =>
              onTypeChange(value as PipelineStageType)
            }
          >
            <SelectTrigger className="border-border bg-muted/60 text-muted-foreground h-6 w-auto gap-1 rounded-md px-1.5 text-[10px]">
              <SelectValue>
                {stage.stage_type === 'start'
                  ? t('stageTypeStart')
                  : stage.stage_type === 'closing'
                    ? t('stageTypeClosing')
                    : t('stageTypeProgress')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">{t('stageTypeStart')}</SelectItem>
              <SelectItem value="progress">{t('stageTypeProgress')}</SelectItem>
              <SelectItem value="closing">{t('stageTypeClosing')}</SelectItem>
            </SelectContent>
          </Select>
          {stage.stage_type === 'closing' && (
            <Select
              value={stage.closing_outcome ?? 'won'}
              onValueChange={(value) =>
                onOutcomeChange(value as PipelineClosingOutcome)
              }
            >
              <SelectTrigger className="border-border bg-muted/60 text-muted-foreground h-6 w-auto gap-1 rounded-md px-1.5 text-[10px]">
                <SelectValue>
                  {stage.closing_outcome === 'lost'
                    ? t('outcomeLost')
                    : t('outcomeWon')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="won">{t('outcomeWon')}</SelectItem>
                <SelectItem value="lost">{t('outcomeLost')}</SelectItem>
              </SelectContent>
            </Select>
          )}
          <span className="text-muted-foreground text-[10px]">
            {t('stagePosition', { position: index + 1 })}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
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
        className="border-border h-4 w-4 rounded-full border"
        style={{ backgroundColor: value }}
        aria-label={t('changeColor')}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="border-border bg-popover absolute top-6 left-0 z-20 flex w-36 flex-wrap gap-1 rounded-lg border p-2 shadow-lg">
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
                    c === value ? 'var(--foreground)' : 'transparent',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
