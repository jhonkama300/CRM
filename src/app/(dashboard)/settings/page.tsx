'use client';

import { Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/hooks/use-auth';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ChannelsPanel } from '@/components/settings/channels-panel';
import { TemplateManager } from '@/components/settings/template-manager';
import { QuickRepliesManager } from '@/components/settings/quick-replies-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { PipelinesSettings } from '@/components/settings/pipelines-settings';
import { WorkTimePanel } from '@/components/settings/worktime-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { InboxSettings } from '@/components/settings/inbox-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import { HealthPanel } from '@/components/settings/health-panel';
import { AuditLogPanel } from '@/components/settings/audit-log-panel';
import {
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';

// `useSearchParams` opts this page out of static prerendering unless it
// sits under a Suspense boundary. Without one, the production build hits
// the "missing Suspense with CSR bailout" error and the whole page bails
// to client-side rendering — shipping a settings screen whose rail never
// wires up its click handlers. You land on the section the URL carried
// (the account-menu Settings link points at `?tab=channels`) and can't
// navigate away. Mirror the login/signup split: a thin wrapper supplies
// the boundary; the inner component reads the query string.
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency, account } = useAuth();
  const t = useTranslations('Settings');

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const section = resolveSection(searchParams.get('tab'));
  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the one that is
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = {
    deals: defaultCurrency,
  };

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    channels: <ChannelsPanel />,
    templates: <TemplateManager />,
    'quick-replies': <QuickRepliesManager />,
    fields: <FieldsAndTagsPanel />,
    pipelines: <PipelinesSettings />,
    worktime: <WorkTimePanel />,
    inbox: <InboxSettings />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    health: <HealthPanel />,
    audit: <AuditLogPanel />,
    api: <ApiKeysSettings />,
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
            <Settings2 className="size-5" />
          </span>
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              {t('pageTitle')}
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {t('pageDesc')}
            </p>
          </div>
        </div>
        {account?.name ? (
          <span className="border-border bg-card text-muted-foreground inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs">
            <Building2 className="text-primary size-3.5" />
            <span className="text-foreground max-w-48 truncate font-medium">
              {account.name}
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[256px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} onSelect={go} hints={hints} />
        <div className="min-w-0">{panel[section]}</div>
      </div>
    </div>
  );
}
