'use client';

import { useCallback, useEffect, useState } from 'react';
import { GitBranch, Loader2, MessageSquare, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import type { Channel, Pipeline, PipelineStage } from '@/types';
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
  { nameKey: 'newLead', color: '#3b82f6', position: 0 },
  { nameKey: 'qualified', color: '#eab308', position: 1 },
  { nameKey: 'proposalSent', color: '#f97316', position: 2 },
  { nameKey: 'negotiation', color: '#8b5cf6', position: 3 },
  { nameKey: 'won', color: '#22c55e', position: 4 },
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
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [managerOpen, setManagerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
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
      .select('id, name, color, department_id')
      .order('name');
    return (data ?? []) as Channel[];
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
    [supabase],
  );

  const refresh = useCallback(async () => {
    const [nextPipelines, nextChannels] = await Promise.all([
      loadPipelines(),
      loadChannels(),
    ]);
    setPipelines(nextPipelines);
    setChannels(nextChannels);
    setSelectedId((current) => {
      if (current && nextPipelines.some((p) => p.id === current)) return current;
      return nextPipelines[0]?.id ?? '';
    });
    setLoading(false);
  }, [loadPipelines, loadChannels]);

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
    }));
    const { error: stagesError } = await supabase
      .from('pipeline_stages')
      .insert(stageRows);

    setCreating(false);
    setCreateOpen(false);
    setName('');
    setChannelId('');
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
              onClick={() => setCreateOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-1 h-4 w-4" />
              {tPage('newPipeline')}
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <GitBranch className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {tPage('noPipelinesYet')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tPage('createToStartTracking')}
          </p>
          {canEdit && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
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
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <GitBranch className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {pipeline.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
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
            setCreateOpen(true);
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
              <p className="text-xs text-muted-foreground">
                {tPage('defaultStagesDesc')}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {tPage('channelOptional')}
              </Label>
              <Select
                value={channelId || '__none__'}
                onValueChange={(value) =>
                  setChannelId(value === '__none__' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tPage('noChannel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{tPage('noChannel')}</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {tPage('channelOptionalHint')}
              </p>
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
