'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
  Maximize2,
  Network,
  Pencil,
  Plus,
  Shield,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
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
import { OrganizationDirectory } from './organization-directory';
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

interface OrganizationPanelProps {
  /** Render only the fullscreen structure dialog (Settings entry). */
  fullscreenOnly?: boolean;
  /** Called when the standalone dialog closes (Settings entry). */
  onClose?: () => void;
}

export function OrganizationPanel({
  fullscreenOnly = false,
  onClose,
}: OrganizationPanelProps) {
  const t = useTranslations('Settings.organization');
  const tRoles = useTranslations('Settings.organization.roles');
  const { accountId, account, user, refreshProfile } = useAuth();
  const canEdit = useCan('edit-settings');
  const supabase = useMemo(() => createClient(), []);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [memberships, setMemberships] = useState<DepartmentMember[]>([]);
  const [accountMembers, setAccountMembers] = useState<AccountMember[]>([]);
  const [invitations, setInvitations] = useState<AccountInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'canvas' | 'list'>('canvas');
  const [structureOpen, setStructureOpen] = useState(fullscreenOnly);

  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [draft, setDraft] = useState<DepartmentDraft>(EMPTY_DRAFT);
  const [savingDept, setSavingDept] = useState(false);

  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberDepartment, setMemberDepartment] = useState<Department | null>(
    null
  );
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<DepartmentRole>('agent');
  const [savingMember, setSavingMember] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [inviteDepartment, setInviteDepartment] = useState<Department | null>(
    null
  );
  const [companyInviteOpen, setCompanyInviteOpen] = useState(false);
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

  useEffect(() => {
    if (account?.name) setCompanyName(account.name);
  }, [account?.name]);

  useEffect(() => {
    if (fullscreenOnly && !loading) setStructureOpen(true);
  }, [fullscreenOnly, loading]);

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
    [memberships]
  );

  const openCreate = useCallback((parent: Department | null) => {
    setEditing(null);
    setDraft({
      ...EMPTY_DRAFT,
      parent_id: parent?.id ?? null,
    });
    setDeptDialogOpen(true);
  }, []);

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

  const openAddMember = useCallback(
    (department: Department) => {
      const firstAvailable = accountMembers.find(
        (m) =>
          !memberships.some(
            (x) => x.department_id === department.id && x.user_id === m.user_id
          )
      );
      setMemberDepartment(department);
      setSelectedUserId(firstAvailable?.user_id ?? '__none__');
      setSelectedRole('agent');
      setMemberDialogOpen(true);
    },
    [accountMembers, memberships]
  );

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
  }, [
    accountId,
    fetchData,
    memberDepartment,
    selectedRole,
    selectedUserId,
    supabase,
    t,
  ]);

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
        prev.map((m) => (m.id === membershipId ? { ...m, role } : m))
      );
      toast.success(t('roleUpdated'));
    },
    [supabase, t]
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
    [supabase, t]
  );

  const savePosition = useCallback(
    (id: string, x: number, y: number) => {
      const position_x = Math.round(x);
      const position_y = Math.round(y);
      setDepartments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, position_x, position_y } : d))
      );
      void supabase
        .from('departments')
        .update({ position_x, position_y })
        .eq('id', id)
        .then(({ error }) => {
          if (error) toast.error(error.message);
        });
    },
    [supabase]
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
  const unassigned = accountMembers.filter(
    (m) => !assignedUserIds.has(m.user_id)
  );

  const renderDepartment = (
    department: Department,
    depth: number
  ): ReactNode => {
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
              className="ring-card h-3 w-3 rounded-full ring-4"
              style={{ backgroundColor: department.color }}
            />
            {children.length > 0 && (
              <span className="bg-border mt-1 w-px flex-1" />
            )}
          </div>

          <div className="border-border bg-card mb-3 min-w-0 flex-1 rounded-xl border shadow-sm">
            <div className="border-border flex items-start gap-2 border-b px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggleExpanded(department.id)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground mt-0.5 rounded p-0.5"
                aria-label={isOpen ? t('collapse') : t('expand')}
              >
                {children.length > 0 ? (
                  isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )
                ) : (
                  <span className="block h-4 w-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-semibold">
                  {department.name}
                </p>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {t('membersCount', { count: members.length })} ·{' '}
                  {t('subdepartmentsCount', { count: children.length })}
                  {managerName
                    ? ` · ${t('managerLabel', { name: managerName })}`
                    : ''}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => openCreate(department)}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
                    title={t('addSubdepartment')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(department)}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1"
                    title={t('edit')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(department)}
                    className="text-muted-foreground hover:bg-muted hover:text-destructive rounded p-1"
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
                  <p className="text-muted-foreground text-[11px]">
                    {t('noMembers')}
                  </p>
                ) : (
                  members.map((membership) => {
                    const person = peopleById.get(membership.user_id);
                    const RoleIcon = ROLE_ICON[membership.role];
                    return (
                      <div
                        key={membership.id}
                        className="bg-muted/40 flex items-center gap-2 rounded-lg px-2 py-1.5"
                      >
                        <span className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                          {(person?.full_name || person?.email || 'U')
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <span className="text-foreground min-w-0 flex-1 truncate text-xs">
                          {person ? memberLabel(person) : membership.user_id}
                        </span>
                        {canEdit ? (
                          <Select
                            value={membership.role}
                            onValueChange={(v) =>
                              void updateMemberRole(
                                membership.id,
                                v as DepartmentRole
                              )
                            }
                          >
                            <SelectTrigger
                              className={cn(
                                'h-6 w-auto gap-1 rounded-full border px-2 text-[10px]',
                                ROLE_STYLE[membership.role]
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
                                )
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                              ROLE_STYLE[membership.role]
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
                            className="text-muted-foreground hover:text-destructive rounded p-0.5"
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
                  <div className="border-border space-y-1 rounded-lg border border-dashed px-2 py-1.5">
                    <p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
                      {t('pendingInvitesCount', {
                        count: pendingInvites.length,
                      })}
                    </p>
                    {pendingInvites.map((invitation) => (
                      <p
                        key={invitation.id}
                        className="text-muted-foreground truncate text-[11px]"
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
                      className="text-primary hover:bg-primary/5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px]"
                    >
                      <UserPlus className="h-3 w-3" />
                      {t('addMember')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInviteDepartment(department)}
                      className="text-primary hover:bg-primary/5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px]"
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
        (x) =>
          x.department_id === memberDepartment?.id && x.user_id === m.user_id
      )
  );

  return (
    <div className="space-y-5">
      {fullscreenOnly ? null : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-foreground text-lg font-semibold">
                {t('title')}
              </h2>
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
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

          {canEdit && (
            <div className="border-border bg-card rounded-xl border p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="company-name">{t('companyNameLabel')}</Label>
                  <Input
                    id="company-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="bg-muted text-foreground mt-1.5"
                  />
                  <p className="text-muted-foreground mt-1.5 text-[11px]">
                    {t('companyNameHint')}
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={
                    savingCompany ||
                    !accountId ||
                    !companyName.trim() ||
                    companyName.trim() === (account?.name ?? '')
                  }
                  onClick={async () => {
                    if (!accountId) return;
                    setSavingCompany(true);
                    try {
                      const { error } = await supabase
                        .from('accounts')
                        .update({ name: companyName.trim() })
                        .eq('id', accountId);
                      if (error) throw error;
                      await refreshProfile();
                      toast.success(t('companyUpdated'));
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : t('saveFailed')
                      );
                    } finally {
                      setSavingCompany(false);
                    }
                  }}
                >
                  {savingCompany ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t('saveCompany')}
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label={t('departmentsStat')}
              value={departments.length}
              icon={Building2}
            />
            <Stat label={t('assignedStat')} value={totalMembers} icon={Users} />
            <Stat
              label={t('unassignedStat')}
              value={unassigned.length}
              icon={User}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="border-border bg-card flex items-center rounded-lg border p-0.5">
              <button
                type="button"
                onClick={() => setView('canvas')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  view === 'canvas'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
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
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LayoutList className="h-3.5 w-3.5" />
                {t('listView')}
              </button>
            </div>
            {view === 'canvas' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStructureOpen(true)}
                className="gap-1.5"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                {t('fullscreen')}
              </Button>
            )}
          </div>

          {loading ? (
            <div className="border-border flex items-center justify-center rounded-xl border py-16">
              <Loader2 className="text-primary h-5 w-5 animate-spin" />
            </div>
          ) : view === 'canvas' ? (
            <OrganizationCanvas
              accountName={account?.name ?? t('companyRoot')}
              totalMembers={accountMembers.length}
              onInviteCompany={() => setCompanyInviteOpen(true)}
              currentUserId={user?.id ?? null}
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
            <div className="border-border flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
              <Building2 className="text-muted-foreground/50 h-10 w-10" />
              <p className="text-foreground mt-3 text-sm font-medium">
                {t('emptyTitle')}
              </p>
              <p className="text-muted-foreground mt-1 max-w-sm text-xs">
                {t('emptyDesc')}
              </p>
              {canEdit && (
                <Button
                  onClick={() => openCreate(null)}
                  className="mt-4 gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  {t('addDepartment')}
                </Button>
              )}
            </div>
          ) : (
            <div className="border-border bg-muted/20 rounded-xl border p-3">
              <div className="border-primary/20 bg-primary/5 mb-3 flex items-center gap-2 rounded-lg border px-3 py-2">
                <Building2 className="text-primary h-4 w-4" />
                <span className="text-foreground text-sm font-semibold">
                  {t('companyRoot')}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t('departmentsStat')}: {departments.length}
                </span>
              </div>
              <div className="space-y-1">
                {roots.map((department) => renderDepartment(department, 0))}
              </div>
            </div>
          )}

          {unassigned.length > 0 && (
            <div className="border-border bg-card rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <UserPlus className="text-muted-foreground h-4 w-4" />
                <p className="text-foreground text-sm font-medium">
                  {t('unassignedTitle')}
                </p>
                <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">
                  {unassigned.length}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unassigned.map((member) => (
                  <span
                    key={member.user_id}
                    className="border-border bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]"
                  >
                    {memberLabel(member)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Create/edit department */}
        </>
      )}
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
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
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
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, color: e.target.value }))
                  }
                  className="border-border bg-muted h-8 w-10 cursor-pointer rounded border"
                />
                <Input
                  value={draft.color}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, color: e.target.value }))
                  }
                  className="bg-muted border-border text-foreground font-mono"
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
              {savingDept && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
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
              {savingMember && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {t('addMember')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InviteMemberDialog
        open={companyInviteOpen || !!inviteDepartment}
        onOpenChange={(open) => {
          if (!open) {
            setCompanyInviteOpen(false);
            setInviteDepartment(null);
          }
        }}
        departmentId={inviteDepartment?.id ?? null}
        departmentName={inviteDepartment?.name ?? null}
        onCreated={() => void fetchData()}
      />

      {/* Delete department */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
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

      <Dialog
        open={structureOpen}
        onOpenChange={(open) => {
          setStructureOpen(open);
          if (!open && fullscreenOnly) onClose?.();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={cn(
            'border-border bg-background flex flex-col gap-0 overflow-hidden p-0',
            fullscreenOnly
              ? 'h-[95dvh] w-[95vw] max-w-none rounded-2xl border sm:max-w-none'
              : 'h-[92vh] w-[96vw] max-w-none rounded-2xl sm:max-w-none'
          )}
        >
          <DialogTitle className="sr-only">{t('title')}</DialogTitle>
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
                <span className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
                  <Network className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {t('title')}
                  </p>
                  <p className="text-muted-foreground truncate text-[11px]">
                    {account?.name || t('companyRoot')} · {departments.length}{' '}
                    {t('departmentsStat').toLocaleLowerCase()} ·{' '}
                    {accountMembers.length} {t('employees').toLocaleLowerCase()}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="border-border bg-muted/30 flex items-center gap-0.5 rounded-lg border p-0.5">
                    <button
                      type="button"
                      onClick={() => setView('canvas')}
                      aria-pressed={view === 'canvas'}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                        view === 'canvas'
                          ? 'bg-background text-primary shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Network className="size-3.5" />
                      <span className="hidden sm:inline">
                        {t('canvasView')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setView('list')}
                      aria-pressed={view === 'list'}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                        view === 'list'
                          ? 'bg-background text-primary shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <LayoutList className="size-3.5" />
                      <span className="hidden sm:inline">{t('listView')}</span>
                    </button>
                  </div>
                  {canEdit && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openCreate(null)}
                      className="gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('addDepartment')}
                    </Button>
                  )}
                  <DialogClose
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('closeFullscreen')}
                      />
                    }
                  >
                    <X className="h-4 w-4" />
                  </DialogClose>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {loading ? (
                  <div className="border-border flex h-full items-center justify-center rounded-xl border">
                    <Loader2 className="text-primary h-5 w-5 animate-spin" />
                  </div>
                ) : view === 'canvas' ? (
                  <OrganizationCanvas
                    accountName={account?.name ?? t('companyRoot')}
                    totalMembers={accountMembers.length}
                    onInviteCompany={() => setCompanyInviteOpen(true)}
                    currentUserId={user?.id ?? null}
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
                    className="h-full border-0"
                    fitMinZoom={0.55}
                    showAddButton={false}
                  />
                ) : roots.length === 0 ? (
                  <div className="border-border flex h-full flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
                    <Building2 className="text-muted-foreground/50 h-10 w-10" />
                    <p className="text-foreground mt-3 text-sm font-medium">
                      {t('emptyTitle')}
                    </p>
                    <p className="text-muted-foreground mt-1 max-w-sm text-xs">
                      {t('emptyDesc')}
                    </p>
                    {canEdit && (
                      <Button
                        onClick={() => openCreate(null)}
                        className="mt-4 gap-1.5"
                      >
                        <Plus className="h-4 w-4" />
                        {t('addDepartment')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="border-border bg-muted/20 rounded-xl border p-3">
                      <div className="border-primary/20 bg-primary/5 mb-3 flex items-center gap-2 rounded-lg border px-3 py-2">
                        <Building2 className="text-primary h-4 w-4" />
                        <span className="text-foreground text-sm font-semibold">
                          {t('companyRoot')}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {t('departmentsStat')}: {departments.length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {roots.map((department) =>
                          renderDepartment(department, 0)
                        )}
                      </div>
                    </div>

                    {unassigned.length > 0 && (
                      <div className="border-border bg-card rounded-xl border p-3">
                        <div className="flex items-center gap-2">
                          <UserPlus className="text-muted-foreground h-4 w-4" />
                          <p className="text-foreground text-sm font-medium">
                            {t('unassignedTitle')}
                          </p>
                          <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">
                            {unassigned.length}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {unassigned.map((member) => (
                            <span
                              key={member.user_id}
                              className="border-border bg-muted text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]"
                            >
                              {memberLabel(member)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <aside className="border-border bg-card hidden w-[340px] shrink-0 border-l lg:block">
              <OrganizationDirectory
                members={accountMembers}
                departments={departments}
                memberships={memberships}
                pendingInvites={invitations.length}
              />
            </aside>
          </div>
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
    <div className="border-border bg-card rounded-xl border p-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-foreground mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
