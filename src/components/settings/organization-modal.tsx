'use client';

import { useEffect, useState } from 'react';

import { OrganizationPanel } from './organization-panel';
import { ORGANIZATION_MODAL_EVENT } from '@/lib/organization-modal';

/**
 * Single global host for the company structure dialog. Mounted in the
 * dashboard shell so any screen can open it with `openOrganizationModal()`
 * without navigating away from the current page.
 */
export function OrganizationModalHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(ORGANIZATION_MODAL_EVENT, onOpen);
    return () => window.removeEventListener(ORGANIZATION_MODAL_EVENT, onOpen);
  }, []);

  if (!open) return null;

  return <OrganizationPanel fullscreenOnly onClose={() => setOpen(false)} />;
}
