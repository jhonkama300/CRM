'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
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
  ChevronDown,
  ChevronUp,
  MailPlus,
  Pencil,
  Plus,
  Rows3,
  Trash2,
  UsersRound,
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
  collapsed: boolean;
  isOwnDepartment: boolean;
  onToggle: (department: Department) => void;
  onAddChild: (department: Department) => void;
  onEdit: (department: Department) => void;
  onDelete: (department: Department) => void;
  onAddMember: (department: Department) => void;
  onInvite: (department: Department) => void;
}

type DepartmentNodeType = Node<DepartmentNodeData, 'department'>;
type OrgNodeType = DepartmentNodeType | CompanyNodeType;

const NODE_WIDTH = 280;
const NODE_HEIGHT = 196;
const COMPANY_WIDTH = 280;
const COMPANY_HEIGHT = 196;

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
    collapsed,
    isOwnDepartment,
    onToggle,
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
        'group bg-card relative flex h-[196px] w-[280px] flex-col rounded-xl border px-3.5 py-3 text-left shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-[box-shadow,border-color]',
        selected
          ? 'border-[var(--nc)]'
          : 'border-border hover:border-[var(--nc)]'
      )}
      onDoubleClick={() => onEdit(department)}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-card !h-2.5 !w-2.5 !border-2 !border-[var(--nc)]"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl"
        style={{ backgroundColor: color }}
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
        {isOwnDepartment && (
          <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[8px] font-semibold tracking-wide uppercase">
            {t('yourDepartment')}
          </span>
        )}
        <span className="border-border text-muted-foreground ml-auto rounded border px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.1em] uppercase">
          {t('membersCount', { count: members.length })}
        </span>
      </div>

      <div className="text-foreground mt-2 truncate text-[13px] font-semibold">
        {department.name}
      </div>

      <div className="text-muted-foreground mt-1 line-clamp-2 min-h-8 text-[11px] leading-relaxed">
        {t('subdepartmentsCount', { count: childCount })}
        {managerName ? ` · ${t('managerLabel', { name: managerName })}` : ''}
      </div>

      <div className="border-border mt-2.5 flex items-center gap-1.5 border-t pt-2.5">
        {visibleMembers.length === 0 ? (
          <span className="text-muted-foreground text-[10px]">
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
                    className="border-card bg-muted text-foreground flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-semibold"
                    title={label}
                  >
                    {initials(label)}
                  </span>
                );
              })}
            </div>
            {members.length > visibleMembers.length && (
              <span className="text-muted-foreground text-[10px]">
                +{members.length - visibleMembers.length}
              </span>
            )}
          </>
        )}
        {pendingInvites > 0 && (
          <span className="text-muted-foreground text-[10px]">
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
              className="text-muted-foreground hover:bg-muted hover:text-primary rounded p-1"
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
              className="text-muted-foreground hover:bg-muted hover:text-primary rounded p-1"
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
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
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
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
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
              className="text-muted-foreground hover:bg-muted hover:text-destructive rounded p-1"
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (childCount > 0) onToggle(department);
        }}
        disabled={childCount === 0}
        className={cn(
          'nodrag nopan border-border text-muted-foreground mt-auto flex w-full items-center justify-between border-t pt-2 text-[10px] font-medium',
          childCount > 0
            ? 'hover:text-foreground cursor-pointer'
            : 'cursor-default opacity-60'
        )}
      >
        <span>{t('subdepartmentsCount', { count: childCount })}</span>
        {childCount > 0 ? (
          collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )
        ) : (
          <span className="border-border h-3.5 w-3.5 rounded-full border border-dashed" />
        )}
      </button>
    </div>
  );
}

interface CompanyNodeData extends Record<string, unknown> {
  name: string;
  totalMembers: number;
  members: AccountMember[];
  onInvite: () => void;
  departmentCount: number;
  canEdit: boolean;
  collapsed: boolean;
  onAddRoot: () => void;
  onToggle: () => void;
}

type CompanyNodeType = Node<CompanyNodeData, 'company'>;

function CompanyNode({ data }: NodeProps<CompanyNodeType>) {
  const t = useTranslations('Settings.organization');
  const {
    name,
    totalMembers,
    members,
    departmentCount,
    canEdit,
    collapsed,
    onAddRoot,
    onToggle,
    onInvite,
  } = data;

  return (
    <div className="border-primary/40 bg-card relative flex h-[196px] w-[280px] flex-col rounded-xl border-2 px-4 py-3.5 text-left shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]">
      <span className="bg-primary text-primary-foreground absolute -top-2.5 right-3 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
        {t('yourCompany')}
      </span>
      <div className="flex items-start gap-2.5">
        <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-semibold">
            {name}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {t('employees')}
          </p>
          <span className="border-border bg-muted text-foreground mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px]">
            {t('membersCount', { count: totalMembers })}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInvite();
                }}
                className="nodrag nopan text-muted-foreground hover:bg-muted hover:text-primary rounded p-1"
                title={t('invite')}
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddRoot();
                }}
                className="nodrag nopan text-muted-foreground hover:bg-muted hover:text-primary rounded p-1"
                title={t('addDepartment')}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="border-border mt-2 flex items-center gap-1.5 border-t pt-2">
        <div className="flex -space-x-1.5">
          {members.slice(0, 5).map((member) => (
            <span
              key={member.user_id}
              className="border-card bg-muted text-foreground flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-semibold"
              title={member.full_name || member.email || 'U'}
            >
              {initials(member.full_name || member.email || 'U')}
            </span>
          ))}
        </div>
        {members.length > 5 && (
          <span className="text-muted-foreground text-[10px]">
            +{members.length - 5}
          </span>
        )}
        <span className="text-muted-foreground ml-auto text-[10px]">
          {t('totalEmployees')}: {totalMembers}
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="nodrag nopan border-border text-muted-foreground hover:text-foreground mt-auto flex w-full items-center justify-between border-t pt-2 text-[10px] font-medium"
      >
        <span>{t('subdepartmentsCount', { count: departmentCount })}</span>
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </button>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-card !border-primary !h-2.5 !w-2.5 !border-2"
      />
    </div>
  );
}

const NODE_TYPES = { department: DepartmentNode, company: CompanyNode };

export interface OrganizationCanvasProps {
  accountName: string;
  onInviteCompany: () => void;
  totalMembers: number;
  currentUserId: string | null;
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
  onSelectDepartment: (department: Department | null) => void;
  selectedDepartmentId?: string | null;
  className?: string;
  fitMinZoom?: number;
  showAddButton?: boolean;
}

function OrganizationCanvasInner({
  accountName,
  totalMembers,
  onInviteCompany,
  currentUserId,
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
  onSelectDepartment,
  selectedDepartmentId,
  className,
  fitMinZoom = 0.78,
  showAddButton = true,
}: OrganizationCanvasProps) {
  const t = useTranslations('Settings.organization');
  const [levelMode, setLevelMode] = useState(true);
  const [freePositions, setFreePositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const companyCollapsed = collapsed.has('__company__');

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleDepartments = useMemo(() => {
    if (companyCollapsed) return [];
    const hidden = new Set<string>();
    const byId = new Map(departments.map((d) => [d.id, d]));
    const isHidden = (department: Department): boolean => {
      if (hidden.has(department.id)) return true;
      let parentId = department.parent_id;
      while (parentId) {
        if (collapsed.has(parentId)) {
          hidden.add(department.id);
          return true;
        }
        parentId = byId.get(parentId)?.parent_id ?? null;
      }
      return false;
    };
    return departments.filter((department) => !isHidden(department));
  }, [companyCollapsed, collapsed, departments]);

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
      map.set(department.parent_id, (map.get(department.parent_id) ?? 0) + 1);
    }
    return map;
  }, [departments]);

  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = visibleDepartments
      .filter((d) => d.parent_id)
      .map((d) => ({
        id: `${d.parent_id}->${d.id}`,
        source: d.parent_id!,
        target: d.id,
        type: 'smoothstep',
        style: { stroke: 'var(--border)', strokeWidth: 1.5 },
      }));
    if (!companyCollapsed) {
      for (const root of visibleDepartments.filter((d) => !d.parent_id)) {
        list.push({
          id: `__company__->${root.id}`,
          source: '__company__',
          target: root.id,
          type: 'smoothstep',
          style: { stroke: 'var(--border)', strokeWidth: 1.5 },
        });
      }
    }
    return list;
  }, [visibleDepartments, companyCollapsed]);

  // Always compute a layout for nodes that have never been positioned.
  // Once one card is dragged, the others must keep their laid-out spot
  // instead of collapsing to (0,0).
  const layout = useMemo(
    () =>
      autoLayout(
        [
          {
            id: '__company__',
            width: COMPANY_WIDTH,
            height: COMPANY_HEIGHT,
          },
          ...visibleDepartments.map((d) => ({
            id: d.id,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          })),
        ],
        edges.map((e) => ({ source: e.source, target: e.target })),
        {
          direction: 'TB',
          rankSep: 110,
          nodeSep: 48,
          defaultWidth: NODE_WIDTH,
          defaultHeight: NODE_HEIGHT,
        }
      ),
    [visibleDepartments, edges]
  );

  const ownDepartmentIds = useMemo(() => {
    if (!currentUserId) return new Set<string>();
    return new Set(
      memberships
        .filter((membership) => membership.user_id === currentUserId)
        .map((membership) => membership.department_id)
    );
  }, [memberships, currentUserId]);

  const baseNodes = useMemo<OrgNodeType[]>(() => {
    const departmentNodes: DepartmentNodeType[] = visibleDepartments.map(
      (department) => {
        const stored = { x: department.position_x, y: department.position_y };
        const fallback =
          stored.x === 0 && stored.y === 0
            ? (layout.get(department.id) ?? { x: 0, y: 0 })
            : stored;
        const position = levelMode
          ? (layout.get(department.id) ?? fallback)
          : (freePositions.get(department.id) ?? fallback);
        const members = membersByDepartment.get(department.id) ?? [];
        const manager = members.find((m) => m.role === 'manager');
        const managerPerson = manager ? people.get(manager.user_id) : null;
        return {
          id: department.id,
          type: 'department',
          position,
          selected: department.id === selectedDepartmentId,
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
            collapsed: collapsed.has(department.id),
            isOwnDepartment: ownDepartmentIds.has(department.id),
            onToggle: (target: Department) => toggleCollapsed(target.id),
            onAddChild,
            onEdit,
            onDelete,
            onAddMember,
            onInvite,
          },
        };
      }
    );

    const rootNodes = departmentNodes.filter(
      (node) => !node.data.department.parent_id
    );
    const anchorPositions = rootNodes.length
      ? rootNodes.map((node) => node.position)
      : departments
          .filter((department) => !department.parent_id)
          .map((department) => layout.get(department.id) ?? { x: 0, y: 0 });
    const anchorX = anchorPositions.length
      ? anchorPositions.reduce((sum, position) => sum + position.x, 0) /
        anchorPositions.length
      : 0;
    const anchorY = anchorPositions.length
      ? Math.min(...anchorPositions.map((position) => position.y))
      : 0;
    const companyNode: CompanyNodeType = {
      id: '__company__',
      type: 'company',
      draggable: false,
      position:
        levelMode && layout.get('__company__')
          ? layout.get('__company__')!
          : (freePositions.get('__company__') ?? {
              x: anchorX + (NODE_WIDTH - COMPANY_WIDTH) / 2,
              y: anchorY - COMPANY_HEIGHT - 110,
            }),
      data: {
        name: accountName,
        totalMembers,
        members: accountMembers,
        onInvite: onInviteCompany,
        departmentCount: departments.length,
        canEdit,
        collapsed: companyCollapsed,
        onAddRoot,
        onToggle: () => toggleCollapsed('__company__'),
      },
    };

    return [companyNode, ...departmentNodes];
  }, [
    visibleDepartments,
    layout,
    levelMode,
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
    collapsed,
    ownDepartmentIds,
    accountName,
    totalMembers,
    accountMembers,
    departments,
    companyCollapsed,
    onAddRoot,
    onInviteCompany,
    freePositions,
    selectedDepartmentId,
  ]);

  const [nodes, setNodes, onNodesChange] =
    useNodesState<OrgNodeType>(baseNodes);

  // Sync prop-derived nodes into React Flow only when the source data
  // changes. During a drag the base array is stable, so this must not
  // fire per pointer move - that was the source of the flicker.
  useEffect(() => {
    setNodes(baseNodes);
  }, [baseNodes, setNodes]);

  const capturePositions = () =>
    new Map(nodes.map((node) => [node.id, node.position]));

  const toggleLevels = () => {
    if (levelMode) {
      setFreePositions(capturePositions());
      setLevelMode(false);
    } else {
      setLevelMode(true);
    }
  };

  if (departments.length === 0) {
    return (
      <div
        className={cn(
          'border-border bg-card text-muted-foreground flex h-[620px] w-full flex-col items-center justify-center gap-3 rounded-2xl border text-sm',
          className
        )}
      >
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
    <div
      className={cn(
        'bg-muted/10 border-border h-[620px] w-full overflow-hidden rounded-2xl border',
        className
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesConnectable={false}
        onNodesChange={(changes) =>
          onNodesChange(changes.filter((change) => change.type !== "select"))
        }
        onNodeDragStop={(_, node) => {
          if (node.id === '__company__') return;
          setFreePositions(
            new Map(
              nodes.map((current) => [
                current.id,
                current.id === node.id ? node.position : current.position,
              ])
            )
          );
          setLevelMode(false);
          onPositionChange(node.id, node.position.x, node.position.y);
        }}
        onNodeClick={(_, node) => {
          const department = departments.find((d) => d.id === node.id);
          if (department) onSelectDepartment(department);
        }}
        onNodeDoubleClick={(_, node) => {
          const department = departments.find((d) => d.id === node.id);
          if (department) onEdit(department);
        }}
        fitView
        fitViewOptions={{ padding: 0.15, minZoom: fitMinZoom, maxZoom: 1 }}
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
            (node.data as DepartmentNodeData | undefined)?.department?.color ??
            '#6366f1'
          }
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
          maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
          className="!border-border !bg-card !rounded-xl !border !shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)]"
        />
        <Panel
          position="top-right"
          className="!top-4 !right-4 hidden items-center gap-2 sm:flex"
        >
          <span className="border-border bg-card text-muted-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] shadow-sm">
            <Building2 className="text-primary h-3.5 w-3.5" />
            <strong className="text-foreground tabular-nums">
              {departments.length}
            </strong>
            {t('departmentsStat')}
          </span>
          <span className="border-border bg-card text-muted-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] shadow-sm">
            <UsersRound className="text-primary h-3.5 w-3.5" />
            <strong className="text-foreground tabular-nums">
              {accountMembers.length}
            </strong>
            {t('employees')}
          </span>
        </Panel>
        <Panel position="top-left" className="!top-4 !left-4">
          {canEdit && showAddButton && (
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
            onClick={toggleLevels}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)] transition-colors',
              levelMode
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
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
