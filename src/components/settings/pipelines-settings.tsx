'use client';

import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Loader2, MessageSquare, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import type { Channel, Department, Pipeline, PipelineStage } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsPanelHead } from './settings-panel-head';
import { PipelineSettings } from '@/components/pipelines/pipeline-settings';

const DEFAULT_STAGES = [
  {
    nameKey: 'newLead',
    color: '#3b82f6',
    position: 0,
    stageType: 'start',
    outcome: null,
  },
  {
    nameKey: 'qualified',
    color: '#eab308',
    position: 1,
    stageType: 'progress',
    outcome: null,
  },
  {
    nameKey: 'proposalSent',
    color: '#f97316',
    position: 2,
    stageType: 'progress',
    outcome: null,
  },
  {
    nameKey: 'negotiation',
    color: '#8b5cf6',
    position: 3,
    stageType: 'progress',
    outcome: null,
  },
  {
    nameKey: 'won',
    color: '#22c55e',
    position: 4,
    stageType: 'closing',
    outcome: 'won',
  },
  {
    nameKey: 'lost',
    color: '#f43f5e',
    position: 5,
    stageType: 'closing',
    outcome: 'lost',
  },
] as const;

/**
 * Pipeline management moved out of the board page. This panel lists the
 * account's pipelines and opens the existing full manager (stages,
 * channel, delete) in a dialog. Deal tracking itself stays on /pipelines.
 */
export function PipelinesSettings() {
  const t = useTranslations('Settings.pipelines');
  const tPage = useTranslations('Pipelines.page');
  const tSettings = useTranslations('Pipelines.settings');
  const { user, accountId } = useAuth();
  const canEdit = useCan('edit-settings');
  const supabase = createClient();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [managerOpen, setManagerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [creating, setCreating] = useState(false);

  const loadPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from('pipelines')
      .select('*')
      .order('created_at');
    if (error) {
      toast.error(tSettings('toastFailedSave'));
      return [];
    }
    return (data ?? []) as Pipeline[];
  }, [supabase, tSettings]);

  const loadChannels = useCallback(async () => {
    const { data } = await supabase
      .from('channels')
      .select('id, name, color, department_id, department:departments(id,name)')
      .order('name');
    return (data ?? []) as unknown as Channel[];
  }, [supabase]);

  const loadDepartments = useCallback(async () => {
    const { data } = await supabase
      .from('departments')
      .select('*')
      .order('name');
    return (data ?? []) as Department[];
  }, [supabase]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      if (!pipelineId) return [];
      const { data } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('position');
      return (data ?? []) as PipelineStage[];
    },
    [supabase]
  );

  const refresh = useCallback(async () => {
    const [nextPipelines, nextChannels, nextDepartments] = await Promise.all([
      loadPipelines(),
      loadChannels(),
      loadDepartments(),
    ]);
    setPipelines(nextPipelines);
    setChannels(nextChannels);
    setDepartments(nextDepartments);
    setSelectedId((current) => {
      if (current && nextPipelines.some((p) => p.id === current))
        return current;
      return nextPipelines[0]?.id ?? '';
    });
    setLoading(false);
  }, [loadPipelines, loadChannels, loadDepartments]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void loadStages(selectedId).then((rows) => {
      if (!cancelled) setStages(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [loadStages, selectedId]);

  const selected = pipelines.find((p) => p.id === selectedId) ?? null;
  const selectedCreateChannel = channels.find((c) => c.id === channelId);

  const openCreate = () => {
    setName('');
    setChannelId('');
    setDepartmentId('');
    setCreateOpen(true);
  };

  const channelOptions = [
    { value: '__none__', label: tPage('noChannel') },
    ...channels.map((channel) => ({
      value: channel.id,
      label: channel.department?.name
        ? `${channel.name} · ${channel.department.name}`
        : channel.name,
    })),
  ];
  const departmentOptions = [
    { value: '__none__', label: tSettings('noDepartment') },
    ...departments.map((department) => ({
      value: department.id,
      label: department.name,
    })),
  ];

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || !accountId || !user) return;
    setCreating(true);

    const { data: pipeline, error } = await supabase
      .from('pipelines')
      .insert({
        user_id: user.id,
        account_id: accountId,
        name: trimmed,
        channel_id: channelId || null,
      })
      .select()
      .single();

    if (error || !pipeline) {
      toast.error(tPage('toastFailedCreatePipeline'));
      setCreating(false);
      return;
    }

    const stageRows = DEFAULT_STAGES.map((stage) => ({
      pipeline_id: pipeline.id,
      name: tPage(`defaultStages.${stage.nameKey}`),
      color: stage.color,
      position: stage.position,
      stage_type: stage.stageType,
      closing_outcome: stage.outcome,
    }));
    const { error: stagesError } = await supabase
      .from('pipeline_stages')
      .insert(stageRows);

    if (channelId) {
      await supabase
        .from('channels')
        .update({ department_id: departmentId || null })
        .eq('id', channelId);
    }

    setCreating(false);
    setCreateOpen(false);
    setName('');
    setChannelId('');
    setDepartmentId('');
    await refresh();
    setSelectedId(pipeline.id);
    setManagerOpen(true);
    if (stagesError) {
      toast.error(tSettings('toastFailedAddStage'));
    } else {
      toast.success(tPage('toastPipelineCreated'));
    }
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          canEdit ? (
            <Button
              onClick={openCreate}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-1 h-4 w-4" />
              {tPage('newPipeline')}
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="border-border bg-card flex items-center justify-center rounded-xl border py-16">
          <Loader2 className="text-primary h-5 w-5 animate-spin" />
        </div>
      ) : pipelines.length === 0 ? (
        <div className="border-border flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
          <GitBranch className="text-muted-foreground h-10 w-10" />
          <p className="text-foreground mt-3 text-sm font-medium">
            {tPage('noPipelinesYet')}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {tPage('createToStartTracking')}
          </p>
          {canEdit && (
            <Button
              onClick={openCreate}
              className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4"
            >
              <Plus className="mr-1 h-4 w-4" />
              {tPage('createPipeline')}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {pipelines.map((pipeline) => {
            const channel = channels.find((c) => c.id === pipeline.channel_id);
            return (
              <div
                key={pipeline.id}
                className="border-border bg-card flex items-center gap-3 rounded-xl border p-4"
              >
                <span className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <GitBranch className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {pipeline.name}
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-1 truncate text-xs">
                    <MessageSquare className="h-3 w-3 shrink-0" />
                    {channel?.name ?? tPage('allChannels')}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedId(pipeline.id);
                      setManagerOpen(true);
                    }}
                  >
                    {tSettings('managePipeline')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <PipelineSettings
          open={managerOpen}
          onOpenChange={setManagerOpen}
          pipeline={selected}
          pipelines={pipelines}
          channels={channels}
          departments={departments}
          onSelectPipeline={(id) => setSelectedId(id)}
          stages={stages}
          onPipelinesChanged={() => {
            void refresh();
          }}
          onStagesChanged={() => {
            void loadStages(selectedId).then(setStages);
          }}
          onCreateNewPipeline={() => {
            setManagerOpen(false);
            openCreate();
          }}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-border bg-popover sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {tPage('newPipeline')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {tPage('pipelineName')}
              </Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={tPage('pipelineNamePlaceholder')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleCreate();
                }}
              />
              <p className="text-muted-foreground text-xs">
                {tPage('defaultStagesDesc')}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {tPage('channelOptional')}
              </Label>
              <Select
                items={channelOptions}
                value={channelId || '__none__'}
                onValueChange={(value) => {
                  const nextChannelId =
                    value === '__none__' ? '' : (value ?? '');
                  setChannelId(nextChannelId);
                  const channel = channels.find(
                    (item) => item.id === nextChannelId
                  );
                  setDepartmentId(channel?.department_id ?? '');
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tPage('noChannel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{tPage('noChannel')}</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.department?.name
                        ? `${channel.name} · ${channel.department.name}`
                        : channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {tPage('channelOptionalHint')}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {tSettings('department')}
              </Label>
              <Select
                items={departmentOptions}
                value={departmentId || '__none__'}
                onValueChange={(value) =>
                  setDepartmentId(value === '__none__' ? '' : (value ?? ''))
                }
                disabled={!channelId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tSettings('noDepartment')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {tSettings('noDepartment')}
                  </SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {tSettings('departmentHint')}
              </p>
              {selectedCreateChannel &&
                (selectedCreateChannel.department_id ?? '') !==
                  departmentId && (
                  <p className="text-[11px] text-amber-500">
                    {tSettings('departmentChannelUpdate')}
                  </p>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {tPage('cancel')}
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={creating || !name.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? tPage('creating') : tPage('createPipelineBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
