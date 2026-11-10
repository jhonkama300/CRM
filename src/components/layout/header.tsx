'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useWorkSession } from '@/hooks/use-work-session';
import { cn } from '@/lib/utils';
import {
  Building2,
  LogOut,
  Menu,
  Network,
  Settings as SettingsIcon,
  User,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { GlobalSearch } from '@/components/layout/global-search';
import { WorkPulse } from '@/components/worktime/work-pulse';
import { TeamPresenceCard } from '@/components/worktime/team-presence-card';
import { WorkCard } from '@/components/worktime/work-card';
import { ROLE_META } from '@/components/settings/role-meta';
import { SettingsChip } from '@/components/settings/settings-chip';
import { ModeToggle } from '@/components/layout/mode-toggle';
import { NotificationsMenu } from '@/components/notifications/notifications-menu';
import { ACCOUNT_SETTINGS_EVENT } from '@/lib/account-settings';
import { openOrganizationModal } from '@/lib/organization-modal';

const pageTitles: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/inbox': 'inbox',
  '/company': 'company',
  '/contacts': 'contacts',
  '/pipelines': 'pipelines',
  '/broadcasts': 'broadcasts',
  '/automations': 'automations',
  '/settings': 'settings',
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path)
  );
  return match ? match[1] : 'dashboard';
}

interface HeaderProps {
  /** Wired to the shell's drawer state. Used only on mobile — the
   *  hamburger button is hidden on lg+. */
  onOpenSidebar?: () => void;
}

import { useTranslations } from 'next-intl';

export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations('Header');
  const tRoles = useTranslations('Settings.roles');
  const tWork = useTranslations('WorkTime');
  const pathname = usePathname();
  const { profile, signOut, account, accountRole } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const {
    active: workActive,
    now: workNow,
    pulse: workPulse,
  } = useWorkSession();
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
    'U';

  return (
    <header className="border-border bg-background flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Hamburger — mobile only. 44×44 hit target per Apple HIG. */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t('openMenu')}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-10 w-10 items-center justify-center rounded-md transition-colors lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-foreground truncate text-base font-semibold sm:text-lg">
          {t(titleKey as string)}
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <GlobalSearch />

        <button
          type="button"
          onClick={openOrganizationModal}
          aria-label={t('structure')}
          title={t('structure')}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md transition-colors"
        >
          <Network className="h-4 w-4" />
        </button>

        <NotificationsMenu />

        <ModeToggle />

        <div
          className={cn(
            'border-border bg-card flex h-10 items-center overflow-hidden rounded-full border',
            workStale && 'border-red-500/60 ring-2 ring-red-500/30'
          )}
          title={workStale ? tWork('staleTitle') : undefined}
        >
          <WorkPulse />
          <Popover open={accountOpen} onOpenChange={setAccountOpen}>
            <PopoverTrigger
              className="border-border hover:bg-muted/70 focus:bg-muted/70 data-popup-open:bg-muted/70 flex h-full cursor-pointer items-center border-l px-1.5 transition-colors focus:outline-none"
              aria-label={t('openAccountMenu')}
            >
              <Avatar className="size-8">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t('defaultAvatar')}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={6}
              className="max-h-[min(90vh,760px)] w-[min(92vw,380px)] gap-0 overflow-y-auto p-0"
            >
              <div className="border-border bg-muted/30 border-b p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    {profile?.avatar_url ? (
                      <AvatarImage
                        src={profile.avatar_url}
                        alt={profile.full_name ?? t('defaultAvatar')}
                      />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-foreground truncate text-sm font-semibold">
                        {profile?.full_name ?? t('defaultUser')}
                      </p>
                      {accountRole && roleMeta && RoleIcon ? (
                        <SettingsChip variant={roleMeta.variant}>
                          <RoleIcon />
                          {tRoles(accountRole)}
                        </SettingsChip>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      {profile?.email ?? ''}
                    </p>
                  </div>
                </div>
                {account?.name ? (
                  <div className="border-border bg-card text-muted-foreground mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                    <Building2 className="size-3.5 shrink-0" />
                    <span
                      className="text-foreground truncate"
                      title={account.name}
                    >
                      {account.name}
                    </span>
                  </div>
                ) : null}
              </div>

              <TeamPresenceCard working={workPulse} />
              <WorkCard />

              <div className="border-border border-t p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    window.dispatchEvent(new Event(ACCOUNT_SETTINGS_EVENT));
                  }}
                  className="text-popover-foreground hover:bg-muted flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
                >
                  <User className="size-4" />
                  {t('menuProfile')}
                </button>
                <Link
                  href="/settings?tab=channels"
                  onClick={() => setAccountOpen(false)}
                  className="text-popover-foreground hover:bg-muted flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
                >
                  <SettingsIcon className="size-4" />
                  {t('menuSettings')}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    void signOut();
                  }}
                  className="text-popover-foreground hover:bg-muted flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
                >
                  <LogOut className="size-4" />
                  {t('menuSignOut')}
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}
