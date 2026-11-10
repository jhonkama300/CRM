"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Deal, PipelineStage } from "@/types";
import { DealCard } from "./deal-card";
import { Button } from "@/components/ui/button";
import { CircleDashed, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface PipelineBoardProps {
  stages: PipelineStage[];
  deals: Deal[];
  onDealMoved: (dealId: string, newStageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
  onOpenChat: (deal: Deal) => void;
}

export function PipelineBoard({
  stages,
  deals,
  onDealMoved,
  onAddDeal,
  onEditDeal,
  onOpenChat,
}: PipelineBoardProps) {
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of sortedStages) map.set(stage.id, []);
    for (const deal of deals) {
      const bucket = map.get(deal.stage_id);
      if (bucket) bucket.push(deal);
    }
    return map;
  }, [sortedStages, deals]);

  const sensors = useSensors(
    // 5px activation distance avoids clicks being interpreted as drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Keyboard drag support: focus a card, Space to pick up, arrows to move,
    // Space to drop, Escape to cancel.
    useSensor(KeyboardSensor),
  );

  const activeDeal = activeDealId
    ? deals.find((d) => d.id === activeDealId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveDealId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDealId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const targetStageId = String(over.id);

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === targetStageId) return;
    if (!sortedStages.some((s) => s.id === targetStageId)) return;

    onDealMoved(dealId, targetStageId);
  }

  function handleDragCancel() {
    setActiveDealId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* snap-x + snap-mandatory on mobile so swipes land the next
          stage cleanly at the viewport edge instead of mid-column.
          Disabled on lg+ where snapping would interfere with the
          natural layout. The board can still overflow horizontally on
          lg+ once a pipeline has many stages (columns keep a 260px
          min-width), so a thin scrollbar stays visible on desktop. */}
      <div className="pipeline-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:snap-none">
        {sortedStages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) ?? [];
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={stageDeals}
              onAddDeal={onAddDeal}
              onEditDeal={onEditDeal}
              onOpenChat={onOpenChat}
            />
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {activeDeal ? (
          <div className="opacity-90">
            <DealCard
              deal={activeDeal}
              stage={
                sortedStages.find((s) => s.id === activeDeal.stage_id) ?? null
              }
              onEdit={() => {}}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .pipeline-scroll {
          scroll-behavior: smooth;
        }
        /* On touch devices the peek/snap layout already signals there's
           more to swipe, so the scrollbar is hidden for a clean look.
           On desktop (mouse) the board can overflow with many stages
           and there is no peek hint, so keep a thin, themed scrollbar
           visible to make the overflow discoverable and usable. */
        @media (hover: none), (pointer: coarse) {
          .pipeline-scroll::-webkit-scrollbar {
            height: 0;
            display: none;
          }
          .pipeline-scroll {
            scrollbar-width: none;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .pipeline-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
          }
          .pipeline-scroll::-webkit-scrollbar {
            height: 8px;
          }
          .pipeline-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 9999px;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted-foreground);
          }
        }
      `}</style>
    </DndContext>
  );
}

function StageColumn({
  stage,
  deals,
  onAddDeal,
  onEditDeal,
  onOpenChat,
}: {
  stage: PipelineStage;
  deals: Deal[];
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
  onOpenChat: (deal: Deal) => void;
}) {
  const t = useTranslations("Pipelines.board");
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      className="flex w-[85vw] min-w-[268px] max-w-[320px] shrink-0 snap-start flex-col border-l border-border/70 px-3 pb-3 pt-1 first:border-l-0 lg:w-auto lg:max-w-none lg:flex-1 lg:basis-[280px] lg:shrink lg:snap-none"
      style={{
        background: `linear-gradient(180deg, ${stage.color}0A 0, transparent 150px)`,
      }}
    >
      <div className="flex items-center gap-2 border-b border-border/70 pb-2.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: stage.color,
            boxShadow: `0 0 0 3px ${stage.color}22, 0 0 10px ${stage.color}99`,
          }}
        />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {stage.name}
        </h3>
        <span className="shrink-0 rounded-full bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
          {deals.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`mt-2.5 flex flex-1 flex-col gap-2 transition-all ${
          isOver ? "p-1.5 outline outline-2 outline-dashed" : ""
        }`}
        style={
          isOver
            ? {
                backgroundColor: `${stage.color}0D`,
                outlineColor: stage.color,
              }
            : undefined
        }
      >
        {deals.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 px-3 py-10 text-center">
            <CircleDashed className="h-4 w-4 text-muted-foreground/50" />
            <p className="mt-2 text-[10.5px] text-muted-foreground">
              {t("dropDealHere")}
            </p>
          </div>
        ) : (
          deals.map((deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              stage={stage}
              onEdit={onEditDeal}
              onOpenChat={onOpenChat}
            />
          ))
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddDeal(stage.id)}
        className="mt-2 w-full justify-start rounded-md border-0 bg-transparent text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      >
        <Plus className="mr-1 h-3 w-3" />
        {t("addDeal")}
      </Button>
    </div>
  );
}

function DraggableDealCard({
  deal,
  stage,
  onEdit,
  onOpenChat,
}: {
  deal: Deal;
  stage: PipelineStage;
  onEdit: (deal: Deal) => void;
  onOpenChat: (deal: Deal) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}
    >
      <DealCard
        deal={deal}
        stage={stage}
        onEdit={onEdit}
        onOpenChat={onOpenChat}
      />
    </div>
  );
}
