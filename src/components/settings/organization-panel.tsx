'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import type {
  AccountInvitation,
  AccountMember,
  Department,
  DepartmentMember,
  DepartmentRole,
} from '@/types';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Crown,
  Eye,
  LayoutList,
  Loader2,
  MailPlus,
  Network,
  Pencil,
  Plus,
  Shield,
  Trash2,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { OrganizationCanvas } from './organization-canvas';
import { InviteMemberDialog } from './invite-member-dialog';

const ROLE_ICON: Record<DepartmentRole, typeof Crown> = {
  manager: Crown,
  supervisor: Shield,
  agent: User,
  viewer: Eye,
};

const ROLE_STYLE: Record<DepartmentRole, string> = {
  manager: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
  supervisor: 'border-primary/40 bg-primary/10 text-primary',
  agent: 'border-border bg-muted text-foreground',
  viewer: 'border-border bg-card text-muted-foreground',
};

interface DepartmentDraft {
  name: string;
  parent_id: string | null;
  color: string;
}

const EMPTY_DRAFT: DepartmentDraft = {
  name: '',
  parent_id: null,
  color: '#6366f1',
};

export function OrganizationPanel() {
  const t = useTranslations('Settings.organization');
  const tRoles = useTranslations('Settings.organization.roles');
  const { accountId } = useAuth();
  const canEdit = useCan('edit-settings');
  const supabase = useMemo(() => createClient(), []);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [memberships, setMemberships] = useState<DepartmentMember[]>([]);
  const [accountMembers, setAccountMembers] = useState<AccountMember[]>([]);
  const [invitations, setInvitations] = useState<AccountInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'canvas' | 'list'>('canvas');

  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [draft, setDraft] = useState<DepartmentDraft>(EMPTY_DRAFT);
  const [savingDept, setSavingDept] = useState(false);

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberDepartment, setMemberDepartment] = useState<Department | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<DepartmentRole>('agent');
  const [savingMember, setSavingMember] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [inviteDepartment, setInviteDepartment] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [deptRes, memberRes, people, inviteData] = await Promise.all([
      supabase
        .from('departments')
        .select('*')
        .order('position', { ascending: true })
        .order('name', { ascending: true }),
      supabase.from('department_members').select('*'),
      fetchAccountMembers(),
      canEdit
        ? fetch('/api/account/invitations', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : { invitations: [] }))
            .catch(() => ({ invitations: [] }))
        : Promise.resolve({ invitations: [] }),
    ]);

    if (deptRes.error) {
      toast.error(deptRes.error.message);
    } else {
      const rows = (deptRes.data ?? []) as Department[];
      setDepartments(rows);
      setExpanded((prev) => {
        if (prev.size > 0) return prev;
        return new Set(rows.map((d) => d.id));
      });
    }
    if (memberRes.data) setMemberships(memberRes.data as DepartmentMember[]);
    setAccountMembers(people);
    setInvitations((inviteData?.invitations ?? []) as AccountInvitation[]);
    setLoading(false);
  }, [supabase, canEdit]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const peopleById = useMemo(() => {
    const map = new Map<string, AccountMember>();
    for (const member of accountMembers) map.set(member.user_id, member);
    return map;
  }, [accountMembers]);

  const membersByDepartment = useMemo(() => {
    const map = new Map<string, DepartmentMember[]>();
    for (const member of memberships) {
      const bucket = map.get(member.department_id) ?? [];
      bucket.push(member);
      map.set(member.department_id, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => {
        const rank: Record<DepartmentRole, number> = {
          manager: 0,
          supervisor: 1,
          agent: 2,
          viewer: 3,
        };
        return rank[a.role] - rank[b.role];
      });
    }
    return map;
  }, [memberships]);

  const invitesByDepartment = useMemo(() => {
    const map = new Map<string, AccountInvitation[]>();
    for (const invitation of invitations) {
      if (!invitation.department_id) continue;
      const bucket = map.get(invitation.department_id) ?? [];
      bucket.push(invitation);
      map.set(invitation.department_id, bucket);
    }
    return map;
  }, [invitations]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, Department[]>();
    for (const department of departments) {
      const key = department.parent_id;
      const bucket = map.get(key) ?? [];
      bucket.push(department);
      map.set(key, bucket);
    }
    return map;
  }, [departments]);

  const roots = childrenByParent.get(null) ?? [];
  const assignedUserIds = useMemo(
    () => new Set(memberships.map((m) => m.user_id)),
    [memberships],
  );

  const openCreate = useCallback(
    (parent: Department | null) => {
      setEditing(null);
      setDraft({
        ...EMPTY_DRAFT,
        parent_id: parent?.id ?? null,
      });
      setDeptDialogOpen(true);
    },
    [],
  );

  const openEdit = useCallback((department: Department) => {
    setEditing(department);
    setDraft({
      name: department.name,
      parent_id: department.parent_id,
      color: department.color,
    });
    setDeptDialogOpen(true);
  }, []);

  const saveDepartment = useCallback(async () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error(t('nameRequired'));
      return;
    }
    if (!accountId) return;

    setSavingDept(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from('departments')
          .update({
            name,
            parent_id: draft.parent_id,
            color: draft.color,
          })
          .eq('id', editing.id);
        if (error) throw error;
        toast.success(t('updated'));
      } else {
        const { error } = await supabase.from('departments').insert({
          account_id: accountId,
          name,
          parent_id: draft.parent_id,
          color: draft.color,
        });
        if (error) throw error;
        toast.success(t('created'));
      }
      setDeptDialogOpen(false);
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSavingDept(false);
    }
  }, [accountId, draft, editing, fetchData, supabase, t]);

  const deleteDepartment = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success(t('deleted'));
      setDeleteTarget(null);
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchData, supabase, t]);

  const openAddMember = useCallback((department: Department) => {
    const firstAvailable = accountMembers.find(
      (m) => !memberships.some((x) => x.department_id === department.id && x.user_id === m.user_id),
    );
    setMemberDepartment(department);
    setSelectedUserId(firstAvailable?.user_id ?? '__none__');
    setSelectedRole('agent');
    setMemberDialogOpen(true);
  }, [accountMembers, memberships]);

  const addMember = useCallback(async () => {
    if (
      !memberDepartment ||
      !selectedUserId ||
      selectedUserId === '__none__' ||
      !accountId
    )
      return;
    setSavingMember(true);
    try {
      const { error } = await supabase.from('department_members').insert({
        account_id: accountId,
        department_id: memberDepartment.id,
        user_id: selectedUserId,
        role: selectedRole,
      });
      if (error) throw error;
      toast.success(t('memberAdded'));
      setMemberDialogOpen(false);
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('memberAddFailed'));
    } finally {
      setSavingMember(false);
    }
  }, [accountId, fetchData, memberDepartment, selectedRole, selectedUserId, supabase, t]);

  const updateMemberRole = useCallback(
    async (membershipId: string, role: DepartmentRole) => {
      const { error } = await supabase
        .from('department_members')
        .update({ role })
        .eq('id', membershipId);
      if (error) {
        toast.error(error.message);
        return;
      }
      setMemberships((prev) =>
        prev.map((m) => (m.id === membershipId ? { ...m, role } : m)),
      );
      toast.success(t('roleUpdated'));
    },
    [supabase, t],
  );

  const removeMember = useCallback(
    async (membershipId: string) => {
      const { error } = await supabase
        .from('department_members')
        .delete()
        .eq('id', membershipId);
      if (error) {
        toast.error(error.message);
        return;
      }
      setMemberships((prev) => prev.filter((m) => m.id !== membershipId));
      toast.success(t('memberRemoved'));
    },
    [supabase, t],
  );

  const savePosition = useCallback(
    (id: string, x: number, y: number) => {
      const position_x = Math.round(x);
      const position_y = Math.round(y);
      setDepartments((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, position_x, position_y } : d,
        ),
      );
      void supabase
        .from('departments')
        .update({ position_x, position_y })
        .eq('id', id)
        .then(({ error }) => {
          if (error) toast.error(error.message);
        });
    },
    [supabase],
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const totalMembers = assignedUserIds.size;
  const unassigned = accountMembers.filter((m) => !assignedUserIds.has(m.user_id));

  const renderDepartment = (department: Department, depth: number): ReactNode => {
    const children = childrenByParent.get(department.id) ?? [];
    const members = membersByDepartment.get(department.id) ?? [];
    const pendingInvites = invitesByDepartment.get(department.id) ?? [];
    const isOpen = expanded.has(department.id);
    const manager = members.find((m) => m.role === 'manager');
    const managerPerson = manager ? peopleById.get(manager.user_id) : null;
    const managerName = managerPerson
      ? memberLabel(managerPerson)
      : (manager?.user_id ?? null);

    return (
      <div key={department.id} className="relative">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center pt-4">
            <span
              className="h-3 w-3 rounded-full ring-4 ring-card"
              style={{ backgroundColor: department.color }}
            />
            {children.length > 0 && <span className="mt-1 w-px flex-1 bg-border" />}
          </div>

          <div className="mb-3 min-w-0 flex-1 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggleExpanded(department.id)}
                className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={isOpen ? t('collapse') : t('expand')}
              >
                {children.length > 0 ? (
                  isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                ) : (
                  <span className="block h-4 w-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {department.name}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t('membersCount', { count: members.length })} ·{' '}
                  {t('subdepartmentsCount', { count: children.length })}
                  {managerName ? ` · ${t('managerLabel', { name: managerName })}` : ''}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => openCreate(department)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('addSubdepartment')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(department)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t('edit')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(department)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title={t('delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {isOpen && (
              <div className="space-y-1.5 px-3 py-2.5">
                {members.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">{t('noMembers')}</p>
                ) : (
                  members.map((membership) => {
                    const person = peopleById.get(membership.user_id);
                    const RoleIcon = ROLE_ICON[membership.role];
                    return (
                      <div
                        key={membership.id}
                        className="flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1.5"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                          {(person?.full_name || person?.email || 'U')
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                          {person ? memberLabel(person) : membership.user_id}
                        </span>
                        {canEdit ? (
                          <Select
                            value={membership.role}
                            onValueChange={(v) =>
                              void updateMemberRole(
                                membership.id,
                                v as DepartmentRole,
                              )
                            }
                          >
                            <SelectTrigger
                              className={cn(
                                'h-6 w-auto gap-1 rounded-full border px-2 text-[10px]',
                                ROLE_STYLE[membership.role],
                              )}
                            >
                              <SelectValue>
                                <span className="inline-flex items-center gap-1">
                                  <RoleIcon className="h-3 w-3" />
                                  {tRoles(membership.role)}
                                </span>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ROLE_ICON) as DepartmentRole[]).map(
                                (role) => (
                                  <SelectItem key={role} value={role}>
                                    {tRoles(role)}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                              ROLE_STYLE[membership.role],
                            )}
                          >
                            <RoleIcon className="h-3 w-3" />
                            {tRoles(membership.role)}
                          </span>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => void removeMember(membership.id)}
                            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                            title={t('removeMember')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
                {pendingInvites.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-dashed border-border px-2 py-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t('pendingInvitesCount', { count: pendingInvites.length })}
                    </p>
                    {pendingInvites.map((invitation) => (
                      <p
                        key={invitation.id}
                        className="truncate text-[11px] text-muted-foreground"
                      >
                        {invitation.label || t('pendingInvite')} ·{' '}
                        {tRoles(invitation.department_role ?? 'agent')}
                      </p>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openAddMember(department)}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-primary hover:bg-primary/5"
                    >
                      <UserPlus className="h-3 w-3" />
                      {t('addMember')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInviteDepartment(department)}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-primary hover:bg-primary/5"
                    >
                      <MailPlus className="h-3 w-3" />
                      {t('invite')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {isOpen && children.length > 0 && (
              <div className="space-y-0 px-3 pb-2">
                {children.map((child) => renderDepartment(child, depth + 1))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const allMembersOptions = accountMembers.filter(
    (m) =>
      !memberships.some(
        (x) => x.department_id === memberDepartment?.id && x.user_id === m.user_id,
      ),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => openCreate(null)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('addDepartment')}
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('departmentsStat')} value={departments.length} icon={Building2} />
        <Stat label={t('assignedStat')} value={totalMembers} icon={Users} />
        <Stat label={t('unassignedStat')} value={unassigned.length} icon={User} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView('canvas')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'canvas'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Network className="h-3.5 w-3.5" />
            {t('canvasView')}
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'list'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutList className="h-3.5 w-3.5" />
            {t('listView')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : view === 'canvas' ? (
        <OrganizationCanvas
          departments={departments}
          memberships={memberships}
          accountMembers={accountMembers}
          canEdit={canEdit}
          onAddChild={openCreate}
          onAddRoot={() => openCreate(null)}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          onAddMember={openAddMember}
          onInvite={setInviteDepartment}
          invitationsByDepartment={invitesByDepartment}
          onPositionChange={savePosition}
        />
      ) : roots.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {t('emptyTitle')}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {t('emptyDesc')}
          </p>
          {canEdit && (
            <Button onClick={() => openCreate(null)} className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" />
              {t('addDepartment')}
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {t('companyRoot')}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('departmentsStat')}: {departments.length}
            </span>
          </div>
          <div className="space-y-1">
            {roots.map((department) => renderDepartment(department, 0))}
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {t('unassignedTitle')}
            </p>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {unassigned.length}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unassigned.map((member) => (
              <span
                key={member.user_id}
                className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {memberLabel(member)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Create/edit department */}
      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('editDepartment') : t('newDepartment')}
            </DialogTitle>
            <DialogDescription>{t('departmentDialogDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('name')}</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder={t('namePlaceholder')}
                className="bg-muted border-border text-foreground"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('parent')}</Label>
              <Select
                value={draft.parent_id ?? '__root__'}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    parent_id: v === '__root__' ? null : v,
                  }))
                }
              >
                <SelectTrigger className="bg-muted border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">{t('noParent')}</SelectItem>
                  {departments
                    .filter((d) => d.id !== editing?.id)
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('color')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-muted"
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
            <Button
              variant="outline"
              onClick={() => setDeptDialogOpen(false)}
              disabled={savingDept}
            >
              {t('cancel')}
            </Button>
            <Button onClick={() => void saveDepartment()} disabled={savingDept}>
              {savingDept && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add member */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('addMemberTo', { department: memberDepartment?.name ?? '' })}
            </DialogTitle>
            <DialogDescription>{t('addMemberDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('member')}</Label>
              <Select
                value={selectedUserId}
                onValueChange={(v) => setSelectedUserId(v ?? '')}
              >
                <SelectTrigger className="bg-muted border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allMembersOptions.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      {t('noAvailableMembers')}
                    </SelectItem>
                  ) : (
                    allMembersOptions.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {memberLabel(m)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('role')}</Label>
              <Select
                value={selectedRole}
                onValueChange={(v) => setSelectedRole(v as DepartmentRole)}
              >
                <SelectTrigger className="bg-muted border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_ICON) as DepartmentRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      {tRoles(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMemberDialogOpen(false)}
              disabled={savingMember}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void addMember()}
              disabled={
                savingMember ||
                !selectedUserId ||
                selectedUserId === '__none__' ||
                allMembersOptions.length === 0
              }
            >
              {savingMember && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('addMember')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InviteMemberDialog
        open={!!inviteDepartment}
        onOpenChange={(open) => {
          if (!open) setInviteDepartment(null);
        }}
        departmentId={inviteDepartment?.id ?? null}
        departmentName={inviteDepartment?.name ?? null}
        onCreated={() => void fetchData()}
      />

      {/* Delete department */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteDesc', { name: deleteTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deleteDepartment()}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
