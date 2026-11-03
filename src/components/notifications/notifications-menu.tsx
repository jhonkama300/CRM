'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { notificationHref } from '@/lib/notifications/route';
import { NOTIFICATION_ICON } from '@/components/notifications/notification-meta';
import { NotificationsDialog } from '@/components/notifications/notifications-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types';

const PREVIEW_LIMIT = 5;

/**
 * Header bell: a small dropdown preview of the latest notifications,
 * with "View all" opening the full modal. The preview is fetched each
 * time the menu opens, so it never shows a stale list after the modal
 * marked things read.
 */
export function NotificationsMenu() {
  const t = useTranslations('Notifications');
  const router = useRouter();
  const { accountId } = useAuth();
  const unread = useUnreadNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);

  useEffect(() => {
    if (!menuOpen || !accountId) return;
    let cancelled = false;
    const supabase = createClient();

    void supabase
      .from('notifications')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(PREVIEW_LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return;
        setItems(error ? [] : ((data ?? []) as Notification[]));
      });

    return () => {
      cancelled = true;
    };
  }, [menuOpen, accountId]);

  const openNotification = (n: Notification) => {
    setMenuOpen(false);
    if (!n.read_at) {
      const supabase = createClient();
      void supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', n.id)
        .is('read_at', null)
        .then(({ error }) => {
          if (error) toast.error(t('markReadFailed'));
        });
    }
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(next) => {
          setMenuOpen(next);
          // Clear on close so the next open starts from the spinner
          // instead of flashing a stale preview.
          if (!next) setItems(null);
        }}
      >
        <DropdownMenuTrigger
          aria-label={t('title')}
          title={t('title')}
          className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground ring-2 ring-background"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="w-[min(92vw,360px)] min-w-0 bg-popover p-0 text-popover-foreground ring-border"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <p className="text-sm font-semibold text-foreground">
              {t('title')}
            </p>
            {unread > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>

          <div className="max-h-[min(60vh,320px)] overflow-y-auto p-1">
            {items === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-3 py-7 text-center">
                <Bell className="size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">
                  {t('emptyTitle')}
                </p>
              </div>
            ) : (
              items.map((n) => {
                const Icon = NOTIFICATION_ICON[n.type] ?? Bell;
                const isUnread = !n.read_at;
                return (
                  <DropdownMenuItem
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-md p-2',
                      isUnread && 'bg-primary/5',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                        isUnread ? 'bg-primary/15' : 'bg-muted',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-4',
                          isUnread ? 'text-primary' : 'text-muted-foreground',
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'truncate text-xs font-semibold',
                            isUnread
                              ? 'text-foreground'
                              : 'text-muted-foreground',
                          )}
                        >
                          {n.title}
                        </span>
                        {isUnread && (
                          <span
                            aria-label={t('unread')}
                            className="size-1.5 shrink-0 rounded-full bg-primary"
                          />
                        )}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                        {formatDistanceToNow(new Date(n.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })
            )}
          </div>

          <div className="border-t border-border p-1">
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                setModalOpen(true);
              }}
              className="cursor-pointer justify-center gap-1.5 py-2 text-xs font-medium text-primary focus:bg-primary-soft focus:text-primary"
            >
              <Bell className="size-3.5" />
              {t('viewAll')}
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {modalOpen && (
        <NotificationsDialog open onOpenChange={setModalOpen} />
      )}
    </>
  );
}
