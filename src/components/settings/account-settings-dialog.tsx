'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Palette, Shield, User, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ACCOUNT_SETTINGS_EVENT } from '@/lib/account-settings';

/**
 * Account settings live in the top-right profile menu instead of the
 * workspace Settings page. This is the one dialog that hosts the three
 * personal panels - profile, login & security, appearance - so they are
 * one click away from anywhere in the app.
 *
 * Header/sidebar open it with a window event (same pattern as the
 * command palette) so the shell only mounts one instance. Panels are
 * lazy so the dashboard bundle doesn't carry the profile/security code
 * until someone opens this dialog.
 */
const PanelFallback = () => (
  <div className="space-y-3" aria-busy="true">
    <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
    <div className="h-32 animate-pulse rounded-xl bg-muted/60" />
  </div>
);

const ProfileForm = dynamic(
  () =>
    import('@/components/settings/profile-form').then((m) => m.ProfileForm),
  { ssr: false, loading: PanelFallback },
);

const SecurityPanel = dynamic(
  () =>
    import('@/components/settings/security-panel').then(
      (m) => m.SecurityPanel,
    ),
  { ssr: false, loading: PanelFallback },
);

const AppearancePanel = dynamic(
  () =>
    import('@/components/settings/appearance-panel').then(
      (m) => m.AppearancePanel,
    ),
  { ssr: false, loading: PanelFallback },
);

type AccountSection = 'profile' | 'security' | 'appearance';

const SECTIONS: { id: AccountSection; icon: LucideIcon }[] = [
  { id: 'profile', icon: User },
  { id: 'security', icon: Shield },
  { id: 'appearance', icon: Palette },
];

export function AccountSettingsDialog() {
  const t = useTranslations('AccountSettings');
  const tSections = useTranslations('Settings.sections');
  const tGroups = useTranslations('Settings.groups');
  const tProfile = useTranslations('Settings.profile');
  const tSecurity = useTranslations('Settings.security');
  const tAppearance = useTranslations('Settings.appearance');
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<AccountSection>('profile');

  const sectionDescription = {
    profile: tProfile('description'),
    security: tSecurity('description'),
    appearance: tAppearance('description'),
  }[section];

  // Reset to the profile tab every time it opens - a stale security
  // tab from a previous visit is never what the "Perfil" menu implies.
  useEffect(() => {
    function onOpen() {
      setSection('profile');
      setOpen(true);
    }
    window.addEventListener(ACCOUNT_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(ACCOUNT_SETTINGS_EVENT, onOpen);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0 [&_a]:cursor-pointer [&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_[role=switch]:not([data-disabled])]:cursor-pointer sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] lg:h-[min(calc(100dvh-2rem),920px)] xl:w-[70vw] xl:min-w-[1180px] xl:max-w-[1500px]">
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <header className="border-border flex items-start gap-4 border-b px-5 py-4 pr-14 sm:px-6">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                {t('title')}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                {t('description')}
              </DialogDescription>
            </div>
          </header>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
            <nav
              aria-label={t('title')}
              className="border-border flex [scrollbar-width:none] gap-1 overflow-x-auto border-b px-3 py-2 md:w-60 md:flex-col md:border-r md:border-b-0 md:bg-muted/20 md:px-3 md:py-4 xl:w-72 [&::-webkit-scrollbar]:hidden"
            >
              <p className="hidden px-2 pt-1 pb-2 text-[11px] font-semibold tracking-[0.09em] text-muted-foreground uppercase md:block">
                {tGroups('account')}
              </p>
              {SECTIONS.map(({ id, icon: Icon }) => {
                const active = id === section;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium whitespace-nowrap transition-colors sm:gap-2.5 sm:px-3 sm:text-sm md:w-full',
                      active
                        ? 'bg-primary-soft text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="hidden size-4 shrink-0 sm:block" />
                    <span className="flex-1">{tSections(id)}</span>
                  </button>
                );
              })}
            </nav>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-5 py-5 sm:px-8">
              <div className="mx-auto max-w-4xl">
                <div className="mb-5 border-b border-border pb-3">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    {tSections(section)}
                  </h2>
                  <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
                    {sectionDescription}
                  </p>
                </div>

                {section === 'profile' ? (
                  <ProfileForm />
                ) : section === 'security' ? (
                  <SecurityPanel />
                ) : (
                  <AppearancePanel />
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
