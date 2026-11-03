import {
  AtSign,
  Bell,
  MessageSquare,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import type { Notification } from '@/types';

/** Icon per notification type, shared by the header preview and modal. */
export const NOTIFICATION_ICON: Record<Notification['type'], typeof Bell> = {
  conversation_assigned: UserPlus,
  channel_health: TriangleAlert,
  mention: AtSign,
  comment_mention: MessageSquare,
};
