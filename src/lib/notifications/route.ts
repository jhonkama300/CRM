import type { Notification } from '@/types';

/** Where clicking a notification should take the user. */
export function notificationHref(
  n: Pick<Notification, 'conversation_id' | 'channel_id' | 'contact_id'>,
): string | null {
  if (n.conversation_id) return `/inbox?c=${n.conversation_id}`;
  if (n.channel_id) return '/settings?tab=channels';
  if (n.contact_id) return `/contacts?contact=${n.contact_id}`;
  return null;
}
