"use client"

import { useMemo, useState } from "react"
import {
  ArrowRightLeft,
  ChevronDown,
  MoreHorizontal,
  Network,
  ShieldCheck,
  Search,
  Shield,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import type {
  AccountMember,
  Department,
  DepartmentMember,
  DepartmentRole,
} from "@/types"

interface OrganizationDirectoryProps {
  members: AccountMember[]
  departments: Department[]
  memberships: DepartmentMember[]
  pendingInvites: number
  accountId: string
  canEdit: boolean
  selectedDepartmentId?: string | null
  onClearDepartmentFilter: () => void
  onChanged: () => void
}

function initials(label: string): string {
  return (
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  )
}

const ROLE_RANK: Record<DepartmentRole, number> = {
  manager: 0,
  supervisor: 1,
  agent: 2,
  viewer: 3,
}

export function OrganizationDirectory({
  members,
  departments,
  memberships,
  pendingInvites,
  accountId,
  canEdit,
  selectedDepartmentId,
  onClearDepartmentFilter,
  onChanged,
}: OrganizationDirectoryProps) {
  const t = useTranslations("Settings.organization")
  const tRoles = useTranslations("Settings.organization.roles")
  const [query, setQuery] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState("")
  const [addUserId, setAddUserId] = useState("")
  const [addRole, setAddRole] = useState<DepartmentRole>("agent")
  const [savingAdd, setSavingAdd] = useState(false)
  const [transferMember, setTransferMember] = useState<AccountMember | null>(
    null,
  )
  const [transferDepartmentId, setTransferDepartmentId] = useState("")
  const [transferring, setTransferring] = useState(false)
  const [removeMember, setRemoveMember] = useState<AccountMember | null>(null)
  const [removing, setRemoving] = useState(false)

  const selectedDepartment = departments.find(
    (department) => department.id === selectedDepartmentId,
  )
  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  )

  const membershipsByUser = useMemo(() => {
    const map = new Map<string, DepartmentMember[]>()
    for (const membership of memberships) {
      const bucket = map.get(membership.user_id) ?? []
      bucket.push(membership)
      map.set(membership.user_id, bucket)
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role])
    }
    return map
  }, [memberships])

  const supervisors = useMemo(() => {
    const seen = new Set<string>()
    return memberships
      .filter((membership) => membership.role === "supervisor")
      .filter((membership) => {
        if (seen.has(membership.user_id)) return false
        seen.add(membership.user_id)
        return true
      })
  }, [memberships])

  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return members
      .map((member) => {
        const memberMemberships = membershipsByUser.get(member.user_id) ?? []
        const memberDepartments = memberMemberships
          .map((membership) => departmentById.get(membership.department_id))
          .filter((department): department is Department => Boolean(department))
        const label = member.full_name || member.email || t("employees")
        const selectedMembership = selectedDepartmentId
          ? memberMemberships.find(
              (membership) =>
                membership.department_id === selectedDepartmentId,
            )
          : null
        const primaryRole = selectedMembership?.role ?? memberMemberships[0]?.role
        const isSupervisor = selectedDepartmentId
          ? selectedMembership?.role === "supervisor"
          : memberMemberships.some(
              (membership) => membership.role === "supervisor",
            )
        return {
          member,
          label,
          memberDepartments,
          primaryRole,
          isSupervisor,
          matchesDepartment:
            !selectedDepartmentId ||
            memberDepartments.some(
              (department) => department.id === selectedDepartmentId,
            ),
        }
      })
      .filter(
        ({
          label,
          member,
          memberDepartments,
          primaryRole,
          isSupervisor,
          matchesDepartment,
        }) => {
          if (!matchesDepartment || isSupervisor) return false
          if (!search) return true
          const haystack = [
            label,
            member.email ?? "",
            primaryRole ? tRoles(primaryRole) : "",
            memberDepartments.map((department) => department.name).join(" "),
          ]
            .join(" ")
            .toLocaleLowerCase()
          return haystack.includes(search)
        },
      )
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [
    departmentById,
    members,
    membershipsByUser,
    query,
    selectedDepartmentId,
    t,
    tRoles,
  ])

  const visibleSupervisors = supervisors.filter((membership) => {
    if (
      selectedDepartmentId &&
      membership.department_id !== selectedDepartmentId
    ) {
      return false
    }
    if (!query.trim()) return true
    const person = members.find((member) => member.user_id === membership.user_id)
    const department = departmentById.get(membership.department_id)
    return `${person?.full_name ?? ""} ${person?.email ?? ""} ${department?.name ?? ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  })

  const addCandidates = useMemo(() => {
    if (!selectedDepartmentId) return []
    const search = addSearch.trim().toLocaleLowerCase()
    return members
      .filter(
        (member) =>
          !memberships.some(
            (membership) =>
              membership.department_id === selectedDepartmentId &&
              membership.user_id === member.user_id,
          ),
      )
      .filter((member) => {
        if (!search) return true
        return `${member.full_name ?? ""} ${member.email ?? ""}`
          .toLocaleLowerCase()
          .includes(search)
      })
      .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
  }, [addSearch, members, memberships, selectedDepartmentId])

  const transferTargets = departments.filter(
    (department) => department.id !== selectedDepartmentId,
  )

  function openAddWithRole(role: DepartmentRole) {
    setAddSearch("")
    setAddUserId("")
    setAddRole(role)
    setAddOpen(true)
  }

  async function addEmployee() {
    if (!selectedDepartmentId || !addUserId || !accountId) return
    const member = members.find((item) => item.user_id === addUserId)
    if (!member) return
    setSavingAdd(true)
    const supabase = createClient()
    const { error } = await supabase.from("department_members").insert({
      account_id: accountId,
      department_id: selectedDepartmentId,
      user_id: member.user_id,
      role: addRole,
    })
    setSavingAdd(false)
    if (error) {
      toast.error(t("memberAddFailed"))
      return
    }
    toast.success(t("memberAdded"))
    setAddOpen(false)
    setAddSearch("")
    setAddUserId("")
    setAddRole("agent")
    onChanged()
  }

  async function transferEmployee() {
    if (
      !transferMember ||
      !selectedDepartmentId ||
      !transferDepartmentId ||
      !accountId
    ) {
      return
    }
    const source = memberships.find(
      (membership) =>
        membership.user_id === transferMember.user_id &&
        membership.department_id === selectedDepartmentId,
    )
    if (!source) return
    setTransferring(true)
    const supabase = createClient()
    const { error: addError } = await supabase
      .from("department_members")
      .upsert(
        {
          account_id: accountId,
          department_id: transferDepartmentId,
          user_id: transferMember.user_id,
          role: source.role,
        },
        { onConflict: "department_id,user_id", ignoreDuplicates: true },
      )
    if (addError) {
      setTransferring(false)
      toast.error(t("transferEmployeeFailed"))
      return
    }
    const { error: removeError } = await supabase
      .from("department_members")
      .delete()
      .eq("id", source.id)
    setTransferring(false)
    if (removeError) {
      toast.error(t("transferEmployeeFailed"))
      return
    }
    toast.success(t("employeeTransferred"))
    setTransferMember(null)
    setTransferDepartmentId("")
    onChanged()
  }

  async function removeFromDepartment() {
    if (!removeMember || !selectedDepartmentId) return
    const source = memberships.find(
      (membership) =>
        membership.user_id === removeMember.user_id &&
        membership.department_id === selectedDepartmentId,
    )
    if (!source) return
    setRemoving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("department_members")
      .delete()
      .eq("id", source.id)
    setRemoving(false)
    if (error) {
      toast.error(t("removeFromDepartmentFailed"))
      return
    }
    toast.success(t("employeeRemovedFromDepartment"))
    setRemoveMember(null)
    onChanged()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UsersRound className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t("directory")}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t("totalEmployees")}: {members.length}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("employees")}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {members.length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("departmentsStat")}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {departments.length}
            </p>
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPeople")}
            className="bg-muted pl-9"
          />
        </div>

        {selectedDepartment ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            <span className="min-w-0 truncate">
              {t("filteredByDepartment")}:{" "}
              <strong className="font-medium text-foreground">
                {selectedDepartment.name}
              </strong>
            </span>
            <button
              type="button"
              onClick={onClearDepartmentFilter}
              aria-label={t("clearDepartmentFilter")}
              title={t("clearDepartmentFilter")}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                {t("supervisors")}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {visibleSupervisors.length}
                </span>
                {selectedDepartmentId && canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                      {t("actions")}
                      <ChevronDown className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-72 border-border bg-popover p-1.5"
                    >
                      <DropdownMenuItem
                        onClick={() => openAddWithRole("supervisor")}
                        className="items-start gap-2 py-2"
                      >
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium">
                            {t("assignSupervisors")}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                            {t("assignSupervisorsDesc")}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
            {visibleSupervisors.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
                {t("noSupervisors")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {visibleSupervisors.map((membership) => {
                  const person = members.find(
                    (member) => member.user_id === membership.user_id,
                  )
                  const department = departmentById.get(membership.department_id)
                  const label = person?.full_name || person?.email || t("employees")
                  return (
                    <div
                      key={membership.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5"
                    >
                      <Avatar className="size-7">
                        {person?.avatar_url ? (
                          <AvatarImage src={person.avatar_url} alt={label} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
                          {initials(label)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {label}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {department?.name ?? t("unassignedStat")}
                        </p>
                      </div>
                      {canEdit && selectedDepartmentId && person ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={t("employeeActions")}
                            title={t("employeeActions")}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-72 border-border bg-popover p-1.5"
                          >
                            <DropdownMenuItem
                              onClick={() => {
                                setTransferMember(person)
                                setTransferDepartmentId("")
                              }}
                              disabled={transferTargets.length === 0}
                              className="items-start gap-2 py-2"
                            >
                              <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                              <span className="min-w-0">
                                <span className="block text-xs font-medium">
                                  {t("transferEmployee")}
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                                  {t("transferEmployeeDesc")}
                                </span>
                              </span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border" />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setRemoveMember(person)}
                              className="items-start gap-2 py-2"
                            >
                              <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
                              <span className="min-w-0">
                                <span className="block text-xs font-medium">
                                  {t("removeFromDepartment")}
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                                  {t("removeFromDepartmentDesc")}
                                </span>
                              </span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Network className="h-3.5 w-3.5" />
                {t("employees")}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {rows.length}
                </span>
                {selectedDepartmentId && canEdit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                      {t("actions")}
                      <ChevronDown className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-72 border-border bg-popover p-1.5"
                    >
                      <DropdownMenuItem
                        onClick={() => openAddWithRole("agent")}
                        className="items-start gap-2 py-2"
                      >
                        <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium">
                            {t("addEmployees")}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                            {t("addEmployeesDesc")}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-2.5 py-3 text-center text-[11px] text-muted-foreground">
                {selectedDepartmentId ? t("noMembers") : t("noPeopleMatch")}
              </p>
            ) : (
              <div className="space-y-1">
                {rows.map(({ member, label, memberDepartments, primaryRole }) => (
                  <div
                    key={member.user_id}
                    className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-muted/40"
                  >
                    <Avatar className="size-8 shrink-0">
                      {member.avatar_url ? (
                        <AvatarImage src={member.avatar_url} alt={label} />
                      ) : null}
                      <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground">
                        {initials(label)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {label}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {primaryRole
                          ? tRoles(primaryRole)
                          : member.email ?? t("unassignedStat")}
                      </p>
                      {memberDepartments.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {memberDepartments.map((department) => (
                            <span
                              key={department.id}
                              className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                            >
                              {department.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {canEdit && selectedDepartmentId ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={t("employeeActions")}
                          title={t("employeeActions")}
                          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-72 border-border bg-popover p-1.5"
                        >
                          <DropdownMenuItem
                            onClick={() => {
                              setTransferMember(member)
                              setTransferDepartmentId("")
                            }}
                            disabled={transferTargets.length === 0}
                            className="items-start gap-2 py-2"
                          >
                            <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                            <span className="min-w-0">
                              <span className="block text-xs font-medium">
                                {t("transferEmployee")}
                              </span>
                              <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                                {t("transferEmployeeDesc")}
                              </span>
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setRemoveMember(member)}
                            className="items-start gap-2 py-2"
                          >
                            <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-xs font-medium">
                                {t("removeFromDepartment")}
                              </span>
                              <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                                {t("removeFromDepartmentDesc")}
                              </span>
                            </span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {pendingInvites > 0 ? (
            <p className="text-[10px] text-muted-foreground">
              {t("pendingInvitesCount", { count: pendingInvites })}
            </p>
          ) : null}
        </div>
      </ScrollArea>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("addEmployeeTo", {
                department: selectedDepartment?.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>{t("addEmployeeDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={addSearch}
                onChange={(event) => setAddSearch(event.target.value)}
                placeholder={t("searchPeople")}
                className="bg-muted pl-8"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {t("role")}
              </p>
              <Select
                value={addRole}
                onValueChange={(value) =>
                  setAddRole(value as DepartmentRole)
                }
              >
                <SelectTrigger className="w-full bg-muted text-foreground">
                  <SelectValue>{tRoles(addRole)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["manager", "supervisor", "agent", "viewer"] as DepartmentRole[]).map(
                    (role) => (
                      <SelectItem key={role} value={role}>
                        {tRoles(role)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="h-64 rounded-lg border border-border">
              <div className="space-y-1 p-1.5">
                {addCandidates.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    {t("noAvailableMembers")}
                  </p>
                ) : (
                  addCandidates.map((member) => {
                    const label =
                      member.full_name || member.email || t("employees")
                    const selected = addUserId === member.user_id
                    return (
                      <button
                        key={member.user_id}
                        type="button"
                        onClick={() => setAddUserId(member.user_id)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                          selected ? "bg-primary/10" : "hover:bg-muted"
                        }`}
                      >
                        <Avatar className="size-7 shrink-0">
                          {member.avatar_url ? (
                            <AvatarImage src={member.avatar_url} alt={label} />
                          ) : null}
                          <AvatarFallback className="bg-muted text-[9px] font-semibold text-foreground">
                            {initials(label)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground">
                            {label}
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {member.email}
                          </span>
                        </span>
                        {selected ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                        ) : null}
                      </button>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={savingAdd}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void addEmployee()}
              disabled={savingAdd || !addUserId}
            >
              {t("addEmployee")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!transferMember}
        onOpenChange={(open) => {
          if (!open) {
            setTransferMember(null)
            setTransferDepartmentId("")
          }
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("transferEmployee")}</DialogTitle>
            <DialogDescription>
              {t("transferEmployeeDialogDesc", {
                name: transferMember?.full_name ?? transferMember?.email ?? "",
                department: selectedDepartment?.name ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("transferTo")}
            </p>
            <Select
              value={transferDepartmentId}
              onValueChange={(value) => setTransferDepartmentId(value ?? "")}
            >
              <SelectTrigger className="w-full bg-muted text-foreground">
                <SelectValue placeholder={t("transferTo")} />
              </SelectTrigger>
              <SelectContent>
                {transferTargets.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTransferMember(null)}
              disabled={transferring}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void transferEmployee()}
              disabled={transferring || !transferDepartmentId}
            >
              {t("transferEmployee")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!removeMember}
        onOpenChange={(open) => {
          if (!open) setRemoveMember(null)
        }}
      >
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("removeFromDepartment")}</DialogTitle>
            <DialogDescription>
              {t("removeFromDepartmentDialogDesc", {
                name: removeMember?.full_name ?? removeMember?.email ?? "",
                department: selectedDepartment?.name ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveMember(null)}
              disabled={removing}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void removeFromDepartment()}
              disabled={removing}
            >
              {t("removeFromDepartment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
