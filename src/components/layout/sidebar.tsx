'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { XylarGlyph } from '@/components/brand-mark';
import { ACCOUNT_SETTINGS_EVENT } from '@/lib/account-settings';
import { openOrganizationModal } from '@/lib/organization-modal';
import { useAuth } from '@/hooks/use-auth';
import { useTotalUnread } from '@/hooks/use-total-unread';
import {
  Bot,
  Building2,
  Crown,
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Radio,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import type { AccountRole } from '@/lib/auth/roles';

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: 'roleOwner',
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className:
      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  admin: {
    icon: Shield,
    labelKey: 'roleAdmin',
    // Primary-tinted: significant but not as scarce as owner.
    className: 'border-primary/40 bg-primary/10 text-primary',
  },
  agent: {
    icon: UserCog,
    labelKey: 'roleAgent',
    // Neutral slate: the operational default.
    className: 'border-border bg-muted text-foreground',
  },
  viewer: {
    icon: User,
    labelKey: 'roleViewer',
    // Muted slate: read-only role; visually quieter than agent.
    className: 'border-border bg-card text-muted-foreground',
  },
};
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
}

const navGroups: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: 'groupMain',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
      { href: '/inbox', labelKey: 'inbox', icon: MessageSquare },
      { href: '/company', labelKey: 'company', icon: Building2 },
    ],
  },
  {
    labelKey: 'groupCrm',
    items: [
      { href: '/contacts', labelKey: 'contacts', icon: Users },
      { href: '/pipelines', labelKey: 'pipelines', icon: GitBranch },
      { href: '/broadcasts', labelKey: 'broadcasts', icon: Radio },
    ],
  },
  {
    labelKey: 'groupAutomation',
    items: [
      { href: '/automations', labelKey: 'automations', icon: Zap },
      { href: '/flows', labelKey: 'flows', icon: Workflow, beta: true },
      { href: '/agents', labelKey: 'aiAgents', icon: Bot },
    ],
  },
];

const bottomNavItems = [
  { href: '/settings', labelKey: 'settings', icon: Settings },
];

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

import { useTranslations } from 'next-intl';

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations('Sidebar');
  const pathname = usePathname();
  const { profile, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const roleMeta = accountRole ? ROLE_CHIP[accountRole] : null;
  const RoleIcon = roleMeta?.icon;
  const workspaceName =
    account?.name || profile?.full_name || profile?.email || t('title');

  const isItemActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  const renderNavItem = (item: NavItem) => {
    const isActive = isItemActive(item.href);
    const showInboxBadge =
      item.href === '/inbox' && totalUnread > 0 && !isActive;

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            // Taller on mobile so fingers can hit the row reliably (=44px).
            'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors lg:py-2',
            isActive
              ? 'bg-background text-foreground ring-primary/20 shadow-sm ring-1'
              : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
          )}
        >
          {isActive && (
            <span
              aria-hidden
              className="bg-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full"
            />
          )}
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/50 text-muted-foreground group-hover:bg-muted group-hover:text-foreground'
            )}
          >
            <item.icon className="size-4" />
          </span>
          <span className="flex-1 truncate">{t(item.labelKey as string)}</span>
          {item.beta && (
            <span
              aria-label={t('beta')}
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-amber-600 uppercase dark:text-amber-300"
            >
              {t('beta')}
            </span>
          )}
          {showInboxBadge && (
            <span
              aria-label={t('unreadConversations', { count: totalUnread })}
              className="bg-primary text-primary-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
            >
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </Link>
      </li>
    );
  };

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label={t('closeMenu')}
        onClick={onClose}
        className={cn(
          'bg-background/70 fixed inset-0 z-30 cursor-pointer backdrop-blur-sm transition-opacity lg:hidden',
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left.
          'border-border bg-card fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-col border-r',
          'transition-transform duration-200 ease-out will-change-transform',
          open ? 'translate-x-0' : '-translate-x-full',
          // Desktop: static, always visible — reset all the mobile framing.
          'isolate lg:relative lg:z-0 lg:w-[280px] lg:translate-x-0 lg:transition-none'
        )}
        aria-label={t('primaryNav')}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-48 bg-[radial-gradient(130%_90%_at_0%_0%,var(--primary-soft),transparent_72%)]"
        />

        {/* Workspace header. On mobile a close button sits at the end. */}
        <div className="border-border/70 shrink-0 border-b p-2.5">
          <div className="border-border/70 bg-background/50 flex items-center gap-2 rounded-xl border p-2">
            <Link
              href="/dashboard"
              className="flex min-w-0 flex-1 items-center gap-2.5"
            >
              <div className="text-primary-foreground ring-primary/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(145deg,var(--primary),var(--primary-hover))] shadow-[0_6px_18px_-10px_var(--primary)] ring-1">
                <XylarGlyph className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-semibold">
                  {workspaceName}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-muted-foreground truncate text-[10px]">
                    {t('workspaceLabel')}
                  </span>
                  {accountRole && roleMeta && RoleIcon ? (
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-medium tracking-wide uppercase',
                        roleMeta.className
                      )}
                    >
                      <RoleIcon className="size-2.5" />
                      {t(roleMeta.labelKey as string)}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => {
                onClose?.();
                openOrganizationModal();
              }}
              aria-label={t('structure')}
              title={t('structure')}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('closeMenu')}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-md lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] overflow-y-auto px-2.5 py-3">
          {navGroups.map((group, index) => (
            <div key={group.labelKey} className={cn(index > 0 && 'mt-4')}>
              <p className="text-muted-foreground/70 px-2.5 pb-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase">
                {t(group.labelKey as string)}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map(renderNavItem)}
              </ul>
            </div>
          ))}
        </nav>

        {/* Settings stays pinned above the account row so it never
            scrolls out of reach. */}
        <div className="border-border/70 shrink-0 border-t px-2.5 py-2">
          <ul className="flex flex-col gap-0.5">
            {bottomNavItems.map(renderNavItem)}
          </ul>
        </div>

        {/* User section */}
        <div className="border-border/70 shrink-0 border-t p-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger className="border-border/70 bg-background/50 hover:bg-muted/60 focus:bg-muted/60 data-popup-open:bg-muted/60 flex w-full cursor-pointer items-center gap-2.5 rounded-xl border p-1.5 text-left transition-colors focus:outline-none">
              <span className="relative shrink-0">
                <Avatar className="size-8">
                  {profile?.avatar_url ? (
                    <AvatarImage
                      src={profile.avatar_url}
                      alt={profile.full_name ?? t('defaultAvatar')}
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {profile?.full_name?.charAt(0)?.toUpperCase() ??
                      profile?.email?.charAt(0)?.toUpperCase() ??
                      'U'}
                  </AvatarFallback>
                </Avatar>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-sm font-medium">
                  {profile?.full_name ?? t('defaultUser')}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {profile?.email ?? ''}
                </p>
              </div>
              <MoreHorizontal className="text-muted-foreground size-4 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="bg-popover text-popover-foreground ring-border min-w-56"
            >
              <DropdownMenuItem
                onClick={() => {
                  onClose?.();
                  window.dispatchEvent(new Event(ACCOUNT_SETTINGS_EVENT));
                }}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <User className="size-4" />
                {t('menuProfile')}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
                {t('menuSettings')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                {t('menuSignOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
