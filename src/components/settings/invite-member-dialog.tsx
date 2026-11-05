'use client';

// ============================================================
// InviteMemberDialog
//
// One modal, three ways to add a teammate:
//   1. Link      - generate a shareable one-time invite URL.
//   2. Email     - invite the address through Supabase Auth.
//   3. Create    - create the account directly, optionally sending
//                  the invitation email. When no email is sent we
//                  show a one-time temporary password instead.
//
// The link flow keeps the one-time-reveal contract: only the token
// hash is stored, so the URL disappears when the modal closes.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  CheckCircle2,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Sparkles,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type InviteRole = 'admin' | 'agent' | 'viewer';
type DepartmentRole = 'manager' | 'supervisor' | 'agent' | 'viewer';
type TabId = 'link' | 'email' | 'create';

interface DepartmentOption {
  id: string;
  name: string;
}

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful create so the parent re-fetches its
   *  roster and pending-invitation list. */
  onCreated: () => void;
  /** Optional department preselection. */
  departmentId?: string | null;
  departmentName?: string | null;
}

const EXPIRY_OPTIONS = [
  { value: '1', labelKey: 'days1' },
  { value: '7', labelKey: 'days7' },
  { value: '30', labelKey: 'days30' },
];

const MAX_LABEL_LEN = 80;

const TAB_ICONS: Record<TabId, typeof Link2> = {
  link: Link2,
  email: Mail,
  create: UserPlus,
};

const TAB_LABEL_KEYS: Record<TabId, string> = {
  link: 'tabLink',
  email: 'tabEmail',
  create: 'tabCreate',
};

const TAB_DESC_KEYS: Record<TabId, string> = {
  link: 'dialogDesc',
  email: 'emailTabDesc',
  create: 'createTabDesc',
};

type CreatedResult =
  | {
      kind: 'link';
      url: string;
      role: InviteRole;
      expiresInDays: number;
      accountName: string;
    }
  | { kind: 'email'; email: string }
  | {
      kind: 'created';
      email: string;
      temporaryPassword?: string;
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMemberDialog({
  open,
  onOpenChange,
  onCreated,
  departmentId = null,
  departmentName = null,
}: InviteMemberDialogProps) {
  const t = useTranslations('Settings.invite');
  const tRoles = useTranslations('Settings.roles');
  const tDeptRoles = useTranslations('Settings.organization.roles');
  const { account } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState<TabId>('link');
  const [role, setRole] = useState<InviteRole>('agent');
  const [expiry, setExpiry] = useState('7');
  const [label, setLabel] = useState('');
  const [departmentRole, setDepartmentRole] = useState<DepartmentRole>('agent');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [noInvite, setNoInvite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreatedResult | null>(null);

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [creatingDepartment, setCreatingDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [savingDepartment, setSavingDepartment] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setSelectedDepartmentId(departmentId ?? '');

    void Promise.all([
      supabase.from('departments').select('id, name').order('name'),
      fetch('/api/account/members', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
      fetch('/api/account/invitations', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ]).then(([departmentRows, membersPayload, invitesPayload]) => {
      if (cancelled) return;
      setDepartments((departmentRows.data as DepartmentOption[] | null) ?? []);
      const members = (membersPayload as { members?: unknown[] } | null)
        ?.members;
      setMemberCount(Array.isArray(members) ? members.length : null);
      const invitations = (invitesPayload as { invitations?: unknown[] } | null)
        ?.invitations;
      setPendingCount(Array.isArray(invitations) ? invitations.length : null);
    });

    return () => {
      cancelled = true;
    };
  }, [open, departmentId, supabase]);

  function reset() {
    setTab('link');
    setRole('agent');
    setExpiry('7');
    setLabel('');
    setDepartmentRole('agent');
    setEmail('');
    setFirstName('');
    setLastName('');
    setNoInvite(false);
    setSubmitting(false);
    setResult(null);
    setSelectedDepartmentId(departmentId ?? '');
    setCreatingDepartment(false);
    setNewDepartmentName('');
    setSavingDepartment(false);
  }

  function validateEmail(): boolean {
    if (!email.trim()) {
      toast.error(t('emailRequired'));
      return false;
    }
    if (!EMAIL_RE.test(email.trim().toLowerCase())) {
      toast.error(t('invalidEmail'));
      return false;
    }
    return true;
  }

  async function handleCreateLink() {
    const trimmedLabel = label.trim();
    if (trimmedLabel.length > MAX_LABEL_LEN) {
      toast.error(t('labelTooLong', { max: MAX_LABEL_LEN }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          expiresInDays: Number(expiry),
          label: trimmedLabel || undefined,
          department_id: selectedDepartmentId || undefined,
          department_role: selectedDepartmentId ? departmentRole : undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('createFailed'));
        return;
      }

      const data = (await res.json()) as {
        url: string;
        expiresInDays: number;
      };

      setResult({
        kind: 'link',
        url: data.url,
        role,
        expiresInDays: data.expiresInDays,
        accountName: account?.name ?? t('fallbackAccountName'),
      });
      onCreated();
    } catch (err) {
      console.error('[InviteMemberDialog] create error:', err);
      toast.error(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmailInvite() {
    if (!validateEmail()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'email',
          email: email.trim().toLowerCase(),
          role,
          departmentId: selectedDepartmentId || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || t('createFailed'));
        return;
      }
      setResult({ kind: 'email', email: email.trim().toLowerCase() });
      onCreated();
    } catch (err) {
      console.error('[InviteMemberDialog] email invite error:', err);
      toast.error(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateUser() {
    if (!validateEmail()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create',
          email: email.trim().toLowerCase(),
          firstName,
          lastName,
          role,
          departmentId: selectedDepartmentId || undefined,
          sendInvite: !noInvite,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || t('createFailed'));
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();
      setResult(
        payload.invited
          ? { kind: 'email', email: normalizedEmail }
          : {
              kind: 'created',
              email: normalizedEmail,
              temporaryPassword:
                typeof payload.temporaryPassword === 'string'
                  ? payload.temporaryPassword
                  : undefined,
            }
      );
      onCreated();
    } catch (err) {
      console.error('[InviteMemberDialog] create user error:', err);
      toast.error(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateDepartment() {
    const name = newDepartmentName.trim();
    if (!name || !account?.id) return;
    setSavingDepartment(true);
    try {
      const { data, error } = await supabase
        .from('departments')
        .insert({ account_id: account.id, name })
        .select('id, name')
        .single();
      if (error || !data) {
        toast.error(error?.message || t('departmentCreateFailed'));
        return;
      }
      setDepartments((prev) =>
        [...prev, data as DepartmentOption].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setSelectedDepartmentId((data as DepartmentOption).id);
      setNewDepartmentName('');
      setCreatingDepartment(false);
      toast.success(
        t('departmentCreated', { name: (data as DepartmentOption).name })
      );
    } catch (err) {
      console.error('[InviteMemberDialog] department create error:', err);
      toast.error(t('networkError'));
    } finally {
      setSavingDepartment(false);
    }
  }

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error(t('clipboardBlocked'));
    }
  }

  function whatsappShareUrl(url: string): string {
    const accountName =
      result?.kind === 'link'
        ? result.accountName
        : (account?.name ?? t('fallbackAccountName'));
    const expiresInDays = result?.kind === 'link' ? result.expiresInDays : 0;
    const message = t('whatsappMessage', {
      accountName,
      expiresInDays,
      url,
    });
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  const closeAndReset = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const ActiveTabIcon = TAB_ICONS[tab];

  return (
    <Dialog open={open} onOpenChange={closeAndReset}>
      <DialogContent
        className={cn(
          'border-border bg-popover gap-0 overflow-hidden p-0',
          result ? 'sm:max-w-2xl' : 'sm:max-w-4xl'
        )}
      >
        {result ? (
          <div className="mx-auto max-h-[85vh] w-full max-w-2xl overflow-y-auto p-5 pr-10 sm:p-8 sm:pr-12">
            {result.kind === 'link' ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-popover-foreground flex items-center gap-2">
                    <Sparkles className="text-primary size-4" />
                    {t('inviteCreated')}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    {t.rich('inviteCreatedDesc', {
                      role: tRoles(result.role),
                      days: result.expiresInDays,
                      bold: (chunks: React.ReactNode) => (
                        <strong>{chunks}</strong>
                      ),
                    })}
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-5 space-y-3">
                  <Label className="text-muted-foreground">
                    {t('inviteLink')}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={result.url}
                      className="border-border bg-muted text-foreground font-mono text-xs"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      type="button"
                      onClick={() => copyText(result.url, t('copied'))}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                    >
                      <Copy className="size-4" />
                      {t('copy')}
                    </Button>
                  </div>

                  <div className="rounded-md border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                    <strong className="font-semibold text-amber-100">
                      {t('saveLinkNow')}
                    </strong>{' '}
                    {t('saveLinkHint')}
                  </div>

                  <a
                    href={whatsappShareUrl(result.url)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={buttonVariants({
                      variant: 'outline',
                      className:
                        'border-border text-muted-foreground hover:bg-muted w-full',
                    })}
                  >
                    <MessageCircle className="size-4" />
                    {t('sendViaWhatsApp')}
                  </a>
                </div>

                <div className="mt-5 flex justify-end">
                  <Button
                    onClick={() => closeAndReset(false)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {t('done')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="text-popover-foreground flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    {result.kind === 'email'
                      ? t('inviteSentTitle')
                      : t('userCreatedTitle')}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    {result.kind === 'email'
                      ? t('inviteSentDesc', { email: result.email })
                      : t('userCreatedDesc', { email: result.email })}
                  </DialogDescription>
                </DialogHeader>

                {result.kind === 'created' && result.temporaryPassword ? (
                  <div className="border-border bg-muted/40 mt-5 space-y-3 rounded-xl border p-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="text-primary size-4" />
                      <Label className="text-foreground">
                        {t('tempPasswordLabel')}
                      </Label>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={result.temporaryPassword}
                        className="border-border bg-background text-foreground font-mono text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        onClick={() =>
                          copyText(
                            result.temporaryPassword ?? '',
                            t('copiedPassword')
                          )
                        }
                        className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                      >
                        <Copy className="size-4" />
                        {t('copy')}
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('tempPasswordHint')}
                    </p>
                  </div>
                ) : null}

                <div className="mt-5 flex justify-end">
                  <Button
                    onClick={() => closeAndReset(false)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {t('done')}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex max-h-[85vh] flex-col sm:max-h-[640px] sm:flex-row">
            <aside className="border-border/70 bg-muted/20 shrink-0 border-b p-4 sm:w-64 sm:border-r sm:border-b-0 sm:p-5">
              <DialogHeader className="pr-8 sm:pr-0">
                <div className="flex items-center gap-2.5">
                  <span className="bg-primary text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm">
                    <UsersRound className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <DialogTitle className="text-popover-foreground truncate text-base">
                      {t('dialogTitle')}
                    </DialogTitle>
                    <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                      {t('membersTotalUnknown')}
                    </p>
                  </div>
                </div>
                <DialogDescription className="text-muted-foreground mt-3 text-xs leading-relaxed">
                  {departmentName
                    ? t('departmentDialogDesc', { department: departmentName })
                    : t('dialogSubtitle')}
                </DialogDescription>
              </DialogHeader>

              <nav
                aria-label={t('dialogTitle')}
                className="mt-5 grid grid-cols-3 gap-1 sm:flex sm:flex-col sm:gap-1.5"
              >
                {(Object.keys(TAB_ICONS) as TabId[]).map((tabId) => {
                  const Icon = TAB_ICONS[tabId];
                  const active = tab === tabId;
                  return (
                    <button
                      key={tabId}
                      type="button"
                      onClick={() => {
                        setTab(tabId);
                        setResult(null);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={
                        active
                          ? 'border-border bg-background text-foreground ring-border flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-left shadow-sm ring-1'
                          : 'text-muted-foreground hover:bg-background/70 hover:text-foreground flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors'
                      }
                    >
                      <span
                        className={
                          active
                            ? 'bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg'
                            : 'bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-lg'
                        }
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {t(TAB_LABEL_KEYS[tabId])}
                        </span>
                        <span className="text-muted-foreground mt-0.5 hidden truncate text-[10px] sm:block">
                          {t(TAB_DESC_KEYS[tabId])}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="border-border/70 bg-background/70 mt-5 rounded-xl border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="border-border bg-card rounded-lg border px-2.5 py-2">
                    <p className="text-muted-foreground text-[9px] font-semibold tracking-wide uppercase">
                      {t('pendingInvitesShort')}
                    </p>
                    <p className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                      {pendingCount ?? '—'}
                    </p>
                  </div>
                  <div className="border-border bg-card rounded-lg border px-2.5 py-2">
                    <p className="text-muted-foreground text-[9px] font-semibold tracking-wide uppercase">
                      {t('membersTotalUnknown')}
                    </p>
                    <p className="text-foreground mt-1 text-xl font-semibold tabular-nums">
                      {memberCount ?? '—'}
                    </p>
                  </div>
                </div>
              </div>
            </aside>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 pr-10 sm:p-6 sm:pr-12">
              <div className="border-border mb-5 flex items-start gap-3 border-b pb-4">
                <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                  <ActiveTabIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-foreground text-sm font-semibold">
                    {t(TAB_LABEL_KEYS[tab])}
                  </h3>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    {t(TAB_DESC_KEYS[tab])}
                  </p>
                </div>
              </div>

              <div className="mb-5 space-y-2">
                <Label className="text-muted-foreground text-xs">
                  {t('departmentLabel')}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={selectedDepartmentId || null}
                    onValueChange={(value) =>
                      setSelectedDepartmentId(
                        !value || value === '__none__' ? '' : value
                      )
                    }
                  >
                    <SelectTrigger className="border-border bg-muted text-foreground w-full">
                      <SelectValue placeholder={t('selectDepartment')} />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover">
                      <SelectItem value="__none__">
                        {t('noDepartment')}
                      </SelectItem>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreatingDepartment((value) => !value)}
                    className="border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 shrink-0"
                  >
                    <Plus className="size-4" />
                    {t('createDepartment')}
                  </Button>
                </div>

                {creatingDepartment ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={newDepartmentName}
                      onChange={(e) => setNewDepartmentName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleCreateDepartment();
                        }
                      }}
                      placeholder={t('newDepartmentPlaceholder')}
                      className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleCreateDepartment()}
                      disabled={savingDepartment || !newDepartmentName.trim()}
                    >
                      {savingDepartment ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        t('create')
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setCreatingDepartment(false);
                        setNewDepartmentName('');
                      }}
                      aria-label={t('cancel')}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>

              {tab === 'link' ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      {t('roleLabel')}
                    </Label>
                    <Select
                      value={role}
                      onValueChange={(v) => v && setRole(v as InviteRole)}
                    >
                      <SelectTrigger className="border-border bg-muted text-foreground w-full">
                        <SelectValue>{tRoles(role)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="admin">{tRoles('admin')}</SelectItem>
                        <SelectItem value="agent">{tRoles('agent')}</SelectItem>
                        <SelectItem value="viewer">
                          {tRoles('viewer')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs">
                      {tRoles(
                        `${role}Hint` as
                          'adminHint' | 'agentHint' | 'viewerHint'
                      )}
                    </p>
                  </div>

                  {selectedDepartmentId && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">
                        {tDeptRoles('departmentRoleLabel')}
                      </Label>
                      <Select
                        value={departmentRole}
                        onValueChange={(v) =>
                          v && setDepartmentRole(v as DepartmentRole)
                        }
                      >
                        <SelectTrigger className="border-border bg-muted text-foreground w-full">
                          <SelectValue>
                            {tDeptRoles(departmentRole)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          <SelectItem value="manager">
                            {tDeptRoles('manager')}
                          </SelectItem>
                          <SelectItem value="supervisor">
                            {tDeptRoles('supervisor')}
                          </SelectItem>
                          <SelectItem value="agent">
                            {tDeptRoles('agent')}
                          </SelectItem>
                          <SelectItem value="viewer">
                            {tDeptRoles('viewer')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      {t('validForLabel')}
                    </Label>
                    <Select
                      value={expiry}
                      onValueChange={(v) => v && setExpiry(v)}
                    >
                      <SelectTrigger className="border-border bg-muted text-foreground w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        {EXPIRY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {t(opt.labelKey as Parameters<typeof t>[0])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      {t('labelTitle')}{' '}
                      <span className="text-muted-foreground text-xs">
                        {t('optional')}
                      </span>
                    </Label>
                    <Input
                      placeholder={t('labelPlaceholder')}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      maxLength={MAX_LABEL_LEN}
                      className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                    />
                    <p className="text-muted-foreground text-xs">
                      {t('labelHint')}
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      onClick={() => closeAndReset(false)}
                      className="border-border text-muted-foreground hover:bg-muted"
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      onClick={() => void handleCreateLink()}
                      disabled={submitting}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t('creating')}
                        </>
                      ) : (
                        t('generateLink')
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}

              {tab === 'email' ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      {t('emailLabel')}
                    </Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                      className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      {t('roleLabel')}
                    </Label>
                    <Select
                      value={role}
                      onValueChange={(v) => v && setRole(v as InviteRole)}
                    >
                      <SelectTrigger className="border-border bg-muted text-foreground w-full">
                        <SelectValue>{tRoles(role)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="admin">{tRoles('admin')}</SelectItem>
                        <SelectItem value="agent">{tRoles('agent')}</SelectItem>
                        <SelectItem value="viewer">
                          {tRoles('viewer')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs">
                      {tRoles(
                        `${role}Hint` as
                          'adminHint' | 'agentHint' | 'viewerHint'
                      )}
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      onClick={() => closeAndReset(false)}
                      className="border-border text-muted-foreground hover:bg-muted"
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      onClick={() => void handleEmailInvite()}
                      disabled={submitting}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t('sendingInvite')}
                        </>
                      ) : (
                        t('sendInvite')
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}

              {tab === 'create' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="text-primary size-4" />
                    <p className="text-foreground text-sm font-semibold">
                      {t('userInfo')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      {t('emailLabel')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                      className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">
                        {t('firstNameLabel')}
                      </Label>
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder={t('firstNamePlaceholder')}
                        className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">
                        {t('lastNameLabel')}
                      </Label>
                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder={t('lastNamePlaceholder')}
                        className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      {t('roleLabel')}
                    </Label>
                    <Select
                      value={role}
                      onValueChange={(v) => v && setRole(v as InviteRole)}
                    >
                      <SelectTrigger className="border-border bg-muted text-foreground w-full">
                        <SelectValue>{tRoles(role)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="admin">{tRoles('admin')}</SelectItem>
                        <SelectItem value="agent">{tRoles('agent')}</SelectItem>
                        <SelectItem value="viewer">
                          {tRoles('viewer')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <label className="border-border bg-muted/30 hover:bg-muted/50 flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-xs transition-colors">
                    <Checkbox
                      checked={noInvite}
                      onCheckedChange={(value) => setNoInvite(value === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-foreground block font-medium">
                        {t('noSendInvite')}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block leading-relaxed">
                        {t('tempPasswordHint')}
                      </span>
                    </span>
                  </label>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="outline"
                      onClick={() => closeAndReset(false)}
                      className="border-border text-muted-foreground hover:bg-muted"
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      onClick={() => void handleCreateUser()}
                      disabled={submitting}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t('creatingUser')}
                        </>
                      ) : (
                        t('createUserButton')
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
