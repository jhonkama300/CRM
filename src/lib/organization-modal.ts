/**
 * Window event that opens the company structure dialog from anywhere in
 * the dashboard. The dialog host is mounted once in the dashboard shell,
 * so callers only dispatch this event instead of navigating to Settings.
 */
export const ORGANIZATION_MODAL_EVENT = 'wacrm:organization-modal';

export function openOrganizationModal() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ORGANIZATION_MODAL_EVENT));
}
