"use client"

import { useState } from "react"
import { Building2, Network, UsersRound } from "lucide-react"
import { useTranslations } from "next-intl"

import { CompanyEmployeesTab } from "@/components/company/company-employees-tab"
import { OrganizationPanel } from "@/components/settings/organization-panel"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"

type CompanyTab = "employees" | "areas"

export default function CompanyPage() {
  const t = useTranslations("Company")
  const { account } = useAuth()
  const [tab, setTab] = useState<CompanyTab>("employees")

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {account?.name || t("title")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("description")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="inline-flex items-center rounded-lg border border-border bg-card p-0.5">
        <button
          type="button"
          onClick={() => setTab("employees")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "employees"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <UsersRound className="h-3.5 w-3.5" />
          {t("employees")}
        </button>
        <button
          type="button"
          onClick={() => setTab("areas")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "areas"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Network className="h-3.5 w-3.5" />
          {t("areas")}
        </button>
      </div>

      {tab === "employees" ? <CompanyEmployeesTab /> : <OrganizationPanel />}
    </div>
  )
}
