"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Search, UserRound } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InviteMemberDialog } from "@/components/settings/invite-member-dialog"
import { useAuth } from "@/hooks/use-auth"
import { usePresence } from "@/hooks/use-presence"
import { createClient } from "@/lib/supabase/client"
import type {
  AccountInvitation,
  AccountMember,
  Department,
  DepartmentMember,
  DepartmentRole,
} from "@/types"

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

export function CompanyEmployeesTab() {
  const t = useTranslations("Company.employeesTable")
  const tRoles = useTranslations("Settings.roles")
  const tDeptRoles = useTranslations("Settings.organization.roles")
  const { account, canManageMembers, user } = useAuth()
  const { getRow } = usePresence()
  const supabase = useMemo(() => createClient(), [])

  const [members, setMembers] = useState<AccountMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [memberships, setMemberships] = useState<DepartmentMember[]>([])
  const [invitations, setInvitations] = useState<AccountInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviteOpen, setInviteOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkDepartmentId, setBulkDepartmentId] = useState("")
  const [bulkRole, setBulkRole] = useState<DepartmentRole>("agent")
  const [savingBulk, setSavingBulk] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [membersRes, departmentsRes, membershipsRes, invitesRes] =
        await Promise.all([
          fetch("/api/account/members", { cache: "no-store" }),
          supabase.from("departments").select("*").order("name"),
          supabase.from("department_members").select("*"),
          canManageMembers
            ? fetch("/api/account/invitations", { cache: "no-store" })
            : Promise.resolve(null),
        ])

      if (!membersRes.ok) throw new Error(`members ${membersRes.status}`)
      const membersJson = (await membersRes.json()) as { members?: AccountMember[] }
      setMembers(membersJson.members ?? [])
      setDepartments((departmentsRes.data as Department[] | null) ?? [])
      setMemberships((membershipsRes.data as DepartmentMember[] | null) ?? [])

      if (invitesRes?.ok) {
        const invitesJson = (await invitesRes.json()) as {
          invitations?: AccountInvitation[]
        }
        setInvitations(invitesJson.invitations ?? [])
      } else {
        setInvitations([])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [canManageMembers, supabase, t])

  useEffect(() => {
    void load()
  }, [load])

  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  )

  const departmentsByUser = useMemo(() => {
    const map = new Map<string, Department[]>()
    for (const membership of memberships) {
      const department = departmentById.get(membership.department_id)
      if (!department) continue
      const bucket = map.get(membership.user_id) ?? []
      bucket.push(department)
      map.set(membership.user_id, bucket)
    }
    return map
  }, [departmentById, memberships])

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return members
    return members.filter((member) => {
      const departmentNames = (departmentsByUser.get(member.user_id) ?? [])
        .map((department) => department.name)
        .join(" ")
      const haystack = [
        member.full_name,
        member.email ?? "",
        tRoles(member.role),
        departmentNames,
      ]
        .join(" ")
        .toLocaleLowerCase()
      return haystack.includes(query)
    })
  }, [departmentsByUser, members, search, tRoles])

  const allSelected =
    filteredMembers.length > 0 &&
    filteredMembers.every((member) => selected.has(member.user_id))

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const member of filteredMembers) next.delete(member.user_id)
      } else {
        for (const member of filteredMembers) next.add(member.user_id)
      }
      return next
    })
  }

  const toggleMember = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const applyBulkDepartment = async () => {
    if (!bulkDepartmentId || selected.size === 0) return
    setSavingBulk(true)
    try {
      const rows = [...selected].map((userId) => ({
        account_id: account?.id ?? "",
        department_id: bulkDepartmentId,
        user_id: userId,
        role: bulkRole,
      }))
      const { error } = await supabase
        .from("department_members")
        .upsert(rows, { onConflict: "department_id,user_id" })
      if (error) throw error
      toast.success(t("bulkUpdated"))
      setBulkOpen(false)
      setSelected(new Set())
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("bulkFailed"))
    } finally {
      setSavingBulk(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <section className="animate-in fade-in-50 duration-200">
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
            />
          </div>
          {canManageMembers && (
            <Button onClick={() => setInviteOpen(true)} className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              {t("invite")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            {t("pendingLogin")}: <strong className="text-foreground">0</strong>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            {t("invited")}: <strong className="text-foreground">{invitations.length}</strong>
          </span>
        </div>
      </div>

      {searchOpen && search.trim() && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("results", { count: filteredMembers.length })}
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={!canManageMembers}
                  aria-label={t("selectAll")}
                />
              </th>
              <th className="px-3 py-2.5">{t("employee")}</th>
              <th className="px-3 py-2.5">{t("department")}</th>
              <th className="px-3 py-2.5">{t("email")}</th>
              <th className="px-3 py-2.5">{t("mobile")}</th>
              <th className="px-3 py-2.5">{t("lastActivity")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center">
                  <UserRound className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {t("empty")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("emptyDesc")}
                  </p>
                </td>
              </tr>
            ) : (
              filteredMembers.map((member) => {
                const memberDepartments =
                  departmentsByUser.get(member.user_id) ?? []
                const label = member.full_name || member.email || t("unnamed")
                const isSelected = selected.has(member.user_id)
                const lastSeen = formatDate(
                  getRow(member.user_id)?.last_seen_at ?? null,
                )

                return (
                  <tr
                    key={member.user_id}
                    className={
                      isSelected
                        ? "border-b border-border bg-primary/5"
                        : "border-b border-border last:border-b-0 hover:bg-muted/30"
                    }
                  >
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMember(member.user_id)}
                        disabled={!canManageMembers}
                        aria-label={label}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-[220px] items-start gap-2.5">
                        <Avatar className="size-9 shrink-0">
                          {member.avatar_url ? (
                            <AvatarImage src={member.avatar_url} alt={label} />
                          ) : null}
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {initials(label)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{label}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {tRoles(member.role)}
                            {member.user_id === user?.id ? ` · ${t("you")}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-[300px] flex-wrap gap-1">
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {account?.name || t("company")}
                        </span>
                        {memberDepartments.map((department) => (
                          <span
                            key={department.id}
                            className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                          >
                            {department.name}
                          </span>
                        ))}
                        {memberDepartments.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            {t("unassigned")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {member.email ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">—</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {lastSeen ?? t("noActivity")}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-3 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
          <span className="text-xs text-muted-foreground">
            {t("selected", { count: selected.size })}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBulkOpen(true)}
            className="gap-1.5"
          >
            {t("changeDepartment")}
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("clearSelection")}
          </button>
        </div>
      )}

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={() => void load()}
      />

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("changeDepartmentTitle")}</DialogTitle>
            <DialogDescription>{t("changeDepartmentDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("department")}</label>
              <Select
                value={bulkDepartmentId}
                onValueChange={(value) => setBulkDepartmentId(value ?? "")}
              >
                <SelectTrigger className="w-full bg-muted text-foreground">
                  <SelectValue placeholder={t("chooseDepartment")} />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("departmentRole")}</label>
              <Select
                value={bulkRole}
                onValueChange={(value) => setBulkRole(value as DepartmentRole)}
              >
                <SelectTrigger className="w-full bg-muted text-foreground">
                  <SelectValue>{tDeptRoles(bulkRole)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["manager", "supervisor", "agent", "viewer"] as DepartmentRole[]).map(
                    (role) => (
                      <SelectItem key={role} value={role}>
                        {tDeptRoles(role)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkOpen(false)}
              disabled={savingBulk}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={() => void applyBulkDepartment()}
              disabled={savingBulk || !bulkDepartmentId}
            >
              {savingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
