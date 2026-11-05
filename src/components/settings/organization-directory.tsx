"use client"

import { useMemo, useState } from "react"
import { Network, Search, Shield, UsersRound } from "lucide-react"
import { useTranslations } from "next-intl"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
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
}

function initials(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
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
}: OrganizationDirectoryProps) {
  const t = useTranslations("Settings.organization")
  const tRoles = useTranslations("Settings.organization.roles")
  const [query, setQuery] = useState("")

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
        const primaryRole = memberMemberships[0]?.role
        return { member, label, memberDepartments, primaryRole }
      })
      .filter(({ label, member, memberDepartments, primaryRole }) => {
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
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [departmentById, members, membershipsByUser, query, t, tRoles])

  const visibleSupervisors = supervisors.filter((membership) => {
    if (!query.trim()) return true
    const person = members.find((member) => member.user_id === membership.user_id)
    const department = departmentById.get(membership.department_id)
    return `${person?.full_name ?? ""} ${person?.email ?? ""} ${department?.name ?? ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  })

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
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                {t("supervisors")}
              </div>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {visibleSupervisors.length}
              </span>
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
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {rows.length}
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-2.5 py-3 text-center text-[11px] text-muted-foreground">
                {t("noPeopleMatch")}
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
    </div>
  )
}
