"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useWorkSession } from "@/hooks/use-work-session";
import { cn } from "@/lib/utils";
import {
  Building2,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { GlobalSearch } from "@/components/layout/global-search";
import { WorkPulse } from "@/components/worktime/work-pulse";
import { WorkCard } from "@/components/worktime/work-card";
import { ROLE_META } from "@/components/settings/role-meta";
import { SettingsChip } from "@/components/settings/settings-chip";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { NotificationsMenu } from "@/components/notifications/notifications-menu";
import { ACCOUNT_SETTINGS_EVENT } from "@/lib/account-settings";

const pageTitles: Record<string, string> = {
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/contacts": "contacts",
  "/pipelines": "pipelines",
  "/broadcasts": "broadcasts",
  "/automations": "automations",
  "/settings": "settings",
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path),
  );
  return match ? match[1] : "dashboard";
}

interface HeaderProps {
  /** Wired to the shell's drawer state. Used only on mobile — the
   *  hamburger button is hidden on lg+. */
  onOpenSidebar?: () => void;
}

import { useTranslations } from "next-intl";

export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations("Header");
  const tRoles = useTranslations("Settings.roles");
  const tWork = useTranslations("WorkTime");
  const pathname = usePathname();
  const { profile, signOut, account, accountRole } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const { active: workActive, now: workNow } = useWorkSession();
  const workStale =
    !!workActive &&
    new Date(workActive.started_at).getTime() <
      new Date(new Date(workNow).setHours(0, 0, 0, 0)).getTime();
  const roleMeta = accountRole ? ROLE_META[accountRole] : null;
  const RoleIcon = roleMeta?.icon;
  const titleKey = getPageTitleKey(pathname);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger — mobile only. 44×44 hit target per Apple HIG. */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t("openMenu")}
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
          {t(titleKey as string)}
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <GlobalSearch />

        <NotificationsMenu />

        <ModeToggle />

        <div
          className={cn(
            'flex h-10 items-center overflow-hidden rounded-full border border-border bg-card',
            workStale && 'border-red-500/60 ring-2 ring-red-500/30',
          )}
          title={workStale ? tWork('staleTitle') : undefined}
        >
          <WorkPulse />
          <Popover open={accountOpen} onOpenChange={setAccountOpen}>
          <PopoverTrigger
            className="flex h-full cursor-pointer items-center border-l border-border px-1.5 transition-colors hover:bg-muted/70 focus:bg-muted/70 focus:outline-none data-popup-open:bg-muted/70"
            aria-label={t("openAccountMenu")}
          >
            <Avatar className="size-8">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? t("defaultAvatar")}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="max-h-[min(90vh,760px)] w-[min(92vw,380px)] gap-0 overflow-y-auto p-0"
          >
            <div className="border-b border-border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="size-10">
                  {profile?.avatar_url ? (
                    <AvatarImage
                      src={profile.avatar_url}
                      alt={profile.full_name ?? t("defaultAvatar")}
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {profile?.full_name ?? t("defaultUser")}
                    </p>
                    {accountRole && roleMeta && RoleIcon ? (
                      <SettingsChip variant={roleMeta.variant}>
                        <RoleIcon />
                        {tRoles(accountRole)}
                      </SettingsChip>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {profile?.email ?? ""}
                  </p>
                </div>
              </div>
              {account?.name ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <Building2 className="size-3.5 shrink-0" />
                  <span className="truncate text-foreground" title={account.name}>
                    {account.name}
                  </span>
                </div>
              ) : null}
            </div>

            <WorkCard />

            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  window.dispatchEvent(new Event(ACCOUNT_SETTINGS_EVENT));
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
              >
                <User className="size-4" />
                {t("menuProfile")}
              </button>
              <Link
                href="/settings?tab=whatsapp"
                onClick={() => setAccountOpen(false)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-muted"
              >
                <SettingsIcon className="size-4" />
                {t("menuSettings")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  void signOut();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
              >
                <LogOut className="size-4" />
                {t("menuSignOut")}
              </button>
            </div>
          </PopoverContent>
        </Popover>
        </div>
      </div>

    </header>
  );
}
