'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Building2,
  MailPlus,
  Pencil,
  Plus,
  Rows3,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import type {
  AccountMember,
  AccountInvitation,
  Department,
  DepartmentMember,
} from '@/types';
import { autoLayout } from '@/lib/flows/layout';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface DepartmentNodeData extends Record<string, unknown> {
  department: Department;
  members: DepartmentMember[];
  people: Map<string, AccountMember>;
  childCount: number;
  managerName: string | null;
  pendingInvites: number;
  canEdit: boolean;
  onAddChild: (department: Department) => void;
  onEdit: (department: Department) => void;
  onDelete: (department: Department) => void;
  onAddMember: (department: Department) => void;
  onInvite: (department: Department) => void;
}

type DepartmentNodeType = Node<DepartmentNodeData, 'department'>;

const NODE_WIDTH = 260;
const NODE_HEIGHT = 140;

function initials(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function DepartmentNode({ data, selected }: NodeProps<DepartmentNodeType>) {
  const t = useTranslations('Settings.organization');
  const {
    department,
    members,
    people,
    childCount,
    managerName,
    canEdit,
    onAddChild,
    onEdit,
    onDelete,
    onAddMember,
    onInvite,
    pendingInvites,
  } = data;

  const visibleMembers = members.slice(0, 3);
  const color = department.color;

  return (
    <div
      style={
        {
          '--nc': color,
          '--nc-soft': `${color}20`,
          borderColor: selected ? color : undefined,
          boxShadow: selected
            ? `0 0 0 1px ${color}, 0 14px 36px -12px ${color}66`
            : undefined,
        } as React.CSSProperties
      }
      className={cn(
        'group bg-card relative w-[250px] rounded-xl border px-3.5 py-3 text-left shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-[box-shadow,border-color]',
        selected
          ? 'border-[var(--nc)]'
          : 'border-border hover:border-[var(--nc)]',
      )}
      onDoubleClick={() => onEdit(department)}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-card !h-2.5 !w-2.5 !border-2 !border-[var(--nc)]"
      />

      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}20`, color }}
        >
          <Building2 className="h-3.5 w-3.5" />
        </span>
        <span
          className="truncate text-[10.5px] font-semibold tracking-wider uppercase"
          style={{ color }}
        >
          {t('departmentLabel')}
        </span>
        <span className="border-border text-muted-foreground ml-auto rounded border px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.1em] uppercase">
          {t('membersCount', { count: members.length })}
        </span>
      </div>

      <div className="text-foreground mt-2 truncate font-mono text-[12px] font-semibold">
        {department.name}
      </div>

      <div className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
        {t('subdepartmentsCount', { count: childCount })}
        {managerName ? ` · ${t('managerLabel', { name: managerName })}` : ''}
      </div>

      <div className="border-border mt-2.5 flex items-center gap-1.5 border-t pt-2.5">
        {visibleMembers.length === 0 ? (
          <span className="text-[10px] text-muted-foreground">
            {t('noMembers')}
          </span>
        ) : (
          <>
            <div className="flex -space-x-1.5">
              {visibleMembers.map((membership) => {
                const person = people.get(membership.user_id);
                const label = person?.full_name || person?.email || 'U';
                return (
                  <span
                    key={membership.id}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-card bg-muted text-[8px] font-semibold text-foreground"
                    title={label}
                  >
                    {initials(label)}
                  </span>
                );
              })}
            </div>
            {members.length > visibleMembers.length && (
              <span className="text-[10px] text-muted-foreground">
                +{members.length - visibleMembers.length}
              </span>
            )}
          </>
        )}
        {pendingInvites > 0 && (
          <span className="text-[10px] text-muted-foreground">
            · {t('pendingInvitesCountShort', { count: pendingInvites })}
          </span>
        )}
        {canEdit && (
          <div className="nodrag nopan ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInvite(department);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
              title={t('invite')}
            >
              <MailPlus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddMember(department);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
              title={t('addMember')}
            >
              <UserPlus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(department);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('addSubdepartment')}
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(department);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={t('edit')}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(department);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              title={t('delete')}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-card !h-2.5 !w-2.5 !border-2 !border-[var(--nc)]"
      />
    </div>
  );
}

const NODE_TYPES = { department: DepartmentNode };

export interface OrganizationCanvasProps {
  departments: Department[];
  memberships: DepartmentMember[];
  accountMembers: AccountMember[];
  canEdit: boolean;
  onAddChild: (department: Department) => void;
  onAddRoot: () => void;
  onEdit: (department: Department) => void;
  onDelete: (department: Department) => void;
  onAddMember: (department: Department) => void;
  onInvite: (department: Department) => void;
  invitationsByDepartment: Map<string, AccountInvitation[]>;
  onPositionChange: (id: string, x: number, y: number) => void;
}

function OrganizationCanvasInner({
  departments,
  memberships,
  accountMembers,
  canEdit,
  onAddChild,
  onAddRoot,
  onEdit,
  onDelete,
  onAddMember,
  onInvite,
  invitationsByDepartment,
  onPositionChange,
}: OrganizationCanvasProps) {
  const t = useTranslations('Settings.organization');
  const [levelMode, setLevelMode] = useState(true);

  const people = useMemo(() => {
    const map = new Map<string, AccountMember>();
    for (const member of accountMembers) map.set(member.user_id, member);
    return map;
  }, [accountMembers]);

  const membersByDepartment = useMemo(() => {
    const map = new Map<string, DepartmentMember[]>();
    for (const membership of memberships) {
      const bucket = map.get(membership.department_id) ?? [];
      bucket.push(membership);
      map.set(membership.department_id, bucket);
    }
    return map;
  }, [memberships]);

  const childCountByDepartment = useMemo(() => {
    const map = new Map<string, number>();
    for (const department of departments) {
      if (!department.parent_id) continue;
      map.set(
        department.parent_id,
        (map.get(department.parent_id) ?? 0) + 1,
      );
    }
    return map;
  }, [departments]);

  const edges = useMemo<Edge[]>(
    () =>
      departments
        .filter((d) => d.parent_id)
        .map((d) => ({
          id: `${d.parent_id}->${d.id}`,
          source: d.parent_id!,
          target: d.id,
          type: 'smoothstep',
          style: { stroke: 'var(--border)', strokeWidth: 1.5 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'var(--muted-foreground)',
            width: 14,
            height: 14,
          },
        })),
    [departments],
  );

  const depthById = useMemo(() => {
    const byId = new Map(departments.map((d) => [d.id, d]));
    const depths = new Map<string, number>();
    const visit = (id: string, seen: Set<string>): number => {
      const cached = depths.get(id);
      if (cached !== undefined) return cached;
      const dept = byId.get(id);
      if (!dept || !dept.parent_id || seen.has(id)) {
        depths.set(id, 0);
        return 0;
      }
      seen.add(id);
      const depth = visit(dept.parent_id, seen) + 1;
      depths.set(id, depth);
      return depth;
    };
    for (const department of departments) visit(department.id, new Set());
    return depths;
  }, [departments]);

  // Always compute a layout for nodes that have never been positioned.
  // Once one card is dragged, the others must keep their laid-out spot
  // instead of collapsing to (0,0).
  const layout = useMemo(
    () =>
      autoLayout(
        departments.map((d) => ({
          id: d.id,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        })),
        edges.map((e) => ({ source: e.source, target: e.target })),
        {
          direction: 'TB',
          rankSep: 90,
          nodeSep: 40,
          defaultWidth: NODE_WIDTH,
          defaultHeight: NODE_HEIGHT,
        },
      ),
    [departments, edges],
  );

  const levelYByDepth = useMemo(() => {
    const levels = new Map<number, number>();
    for (const department of departments) {
      const depth = depthById.get(department.id) ?? 0;
      const position = layout.get(department.id);
      if (position && !levels.has(depth)) levels.set(depth, position.y);
    }
    return levels;
  }, [departments, depthById, layout]);

  const baseNodes = useMemo<DepartmentNodeType[]>(
    () =>
      departments.map((department) => {
        const stored = {
          x: department.position_x,
          y: department.position_y,
        };
        const fallback =
          stored.x === 0 && stored.y === 0
            ? (layout.get(department.id) ?? { x: 0, y: 0 })
            : stored;
        const depth = depthById.get(department.id) ?? 0;
        const position = levelMode
          ? {
              x: fallback.x,
              y: levelYByDepth.get(depth) ?? fallback.y,
            }
          : fallback;
        const members = membersByDepartment.get(department.id) ?? [];
        const manager = members.find((m) => m.role === 'manager');
        const managerPerson = manager
          ? people.get(manager.user_id)
          : null;
        return {
          id: department.id,
          type: 'department',
          position,
          data: {
            department,
            members,
            people,
            childCount: childCountByDepartment.get(department.id) ?? 0,
            managerName:
              managerPerson?.full_name ||
              managerPerson?.email ||
              manager?.user_id ||
              null,
            pendingInvites:
              invitationsByDepartment.get(department.id)?.length ?? 0,
            canEdit,
            onAddChild,
            onEdit,
            onDelete,
            onAddMember,
            onInvite,
          },
        };
      }),
    [
      departments,
      layout,
      depthById,
      levelMode,
      levelYByDepth,
      membersByDepartment,
      people,
      childCountByDepartment,
      canEdit,
      onAddChild,
      onEdit,
      onDelete,
      onAddMember,
      onInvite,
      invitationsByDepartment,
    ],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<DepartmentNodeType>(baseNodes);

  // Sync prop-derived nodes into React Flow only when the source data
  // changes. During a drag the base array is stable, so this must not
  // fire per pointer move - that was the source of the flicker.
  useEffect(() => {
    setNodes(baseNodes);
  }, [baseNodes, setNodes]);

  if (departments.length === 0) {
    return (
      <div className="flex h-[620px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm text-muted-foreground">
        <p>{t('emptyTitle')}</p>
        <p className="max-w-sm text-center text-xs">{t('emptyCanvasDesc')}</p>
        {canEdit && (
          <Button onClick={onAddRoot} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('addDepartment')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="h-[620px] w-full overflow-hidden rounded-xl border border-border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesConnectable={false}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => {
          const depth = depthById.get(node.id) ?? 0;
          const y = levelMode
            ? (levelYByDepth.get(depth) ?? node.position.y)
            : node.position.y;
          const next = { x: node.position.x, y };
          setNodes((prev) =>
            prev.map((n) => (n.id === node.id ? { ...n, position: next } : n)),
          );
          onPositionChange(node.id, next.x, next.y);
        }}
        onNodeDoubleClick={(_, node) => {
          const department = departments.find((d) => d.id === node.id);
          if (department) onEdit(department);
        }}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.4}
          color="var(--border)"
        />
        <Controls
          className="!border-border !bg-card [&_button]:!border-border [&_button]:!bg-card [&_button:hover]:!bg-muted [&_button_svg]:!fill-foreground !overflow-hidden !rounded-xl !border !shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)]"
          showInteractive={false}
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) =>
            (node.data as DepartmentNodeData | undefined)?.department.color ??
            '#6366f1'
          }
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
          maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
          className="!border-border !bg-card !rounded-xl !border !shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)]"
        />
        <Panel position="top-left" className="!top-4 !left-4">
          {canEdit && (
            <button
              type="button"
              onClick={onAddRoot}
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)] transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('addDepartment')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setLevelMode((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)] transition-colors',
              levelMode
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            <Rows3 className="h-4 w-4" />
            {t('levels')}
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function OrganizationCanvas(props: OrganizationCanvasProps) {
  return (
    <ReactFlowProvider>
      <OrganizationCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
