'use client';

import { Building2, Network } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { CompanyEmployeesTab } from '@/components/company/company-employees-tab';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { openOrganizationModal } from '@/lib/organization-modal';

export default function CompanyPage() {
  const t = useTranslations('Company');
  const { account } = useAuth();

  return (
    <div className="flex min-h-[calc(100dvh-6.5rem)] w-full flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-foreground text-xl font-semibold">
              {account?.name || t('title')}
            </h1>
            <p className="text-muted-foreground text-sm">{t('description')}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={openOrganizationModal}
          className="gap-2"
        >
          <Network className="size-4" />
          {t('structureButton')}
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <CompanyEmployeesTab />
      </div>
    </div>
  );
}
