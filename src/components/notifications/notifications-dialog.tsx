'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { notificationsAccountFilter } from '@/lib/notifications/unread-count';
import { notificationHref } from '@/lib/notifications/route';
import { NOTIFICATION_ICON } from '@/components/notifications/notification-meta';
import type { Notification } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Notifications live in the header bell instead of their own page.
 * The list loads on open and keeps a realtime channel only while the
 * modal is visible; clicking a row marks it read, closes the modal and
 * jumps to the related inbox/contact/channel.
 */
export function NotificationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('Notifications');
  const router = useRouter();
  const { accountId } = useAuth();
  const [notifications, setNotifications] = useState<Notification[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();
    const { data, error: fetchErr } = await supabase
      .from('notifications')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (fetchErr) {
      setError(fetchErr.message);
      return;
    }
    setError(null);
    setNotifications((data ?? []) as Notification[]);
  }, [accountId]);

  // The header mounts this dialog on open, so a fresh mount starts at
  // `null` and this is the only load needed.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open || !accountId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-dialog:${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: notificationsAccountFilter(accountId),
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Notification;
            setNotifications((prev) => {
              if (!prev) return [row];
              if (prev.some((n) => n.id === row.id)) return prev;
              return [row, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Notification;
            setNotifications(
              (prev) =>
                prev?.map((n) => (n.id === row.id ? { ...n, ...row } : n)) ??
                prev,
            );
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<Notification>;
            setNotifications(
              (prev) => prev?.filter((n) => n.id !== oldRow.id) ?? prev,
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, accountId]);

  const markRead = useCallback(
    async (id: string) => {
      setNotifications(
        (prev) =>
          prev?.map((n) =>
            n.id === id && !n.read_at
              ? { ...n, read_at: new Date().toISOString() }
              : n,
          ) ?? prev,
      );
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null);
      if (updateErr) {
        toast.error(t('markReadFailed'));
        void load();
      }
    },
    [load, t],
  );

  const handleClick = useCallback(
    (n: Notification) => {
      if (!n.read_at) void markRead(n.id);
      onOpenChange(false);
      const href = notificationHref(n);
      if (href) router.push(href);
    },
    [markRead, onOpenChange, router],
  );

  const unreadIds =
    notifications?.filter((n) => !n.read_at).map((n) => n.id) ?? [];

  const markAllRead = useCallback(async () => {
    if (unreadIds.length === 0 || !accountId) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications(
      (prev) =>
        prev?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? prev,
    );
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('account_id', accountId)
      .is('read_at', null);
    setMarkingAll(false);
    if (updateErr) {
      toast.error(t('markAllFailed'));
      void load();
    }
  }, [unreadIds.length, accountId, load, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(82dvh,720px)] w-[calc(100vw-2rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 [&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-14">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4 text-primary" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t('unreadCount', { count: unreadIds.length })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={unreadIds.length === 0 || markingAll}
            onClick={markAllRead}
          >
            {markingAll ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCheck className="size-3.5" />
            )}
            {t('markAllRead')}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNotifications(null);
                  setError(null);
                  void load();
                }}
              >
                {t('retry')}
              </Button>
            </div>
          ) : notifications === null ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
                <Bell className="size-5 text-primary" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                {t('emptyTitle')}
              </p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                {t('emptyDesc')}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => {
                const Icon = NOTIFICATION_ICON[n.type] ?? Bell;
                const isUnread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                        isUnread
                          ? 'border-primary/30 bg-primary/5 hover:border-primary/50'
                          : 'border-border bg-card hover:bg-muted/40',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg',
                          isUnread ? 'bg-primary/15' : 'bg-muted',
                        )}
                        aria-hidden
                      >
                        <Icon
                          className={cn(
                            'size-4',
                            isUnread
                              ? 'text-primary'
                              : 'text-muted-foreground',
                          )}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              'truncate text-sm font-semibold',
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
                              className="size-2 shrink-0 rounded-full bg-primary"
                            />
                          )}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] text-muted-foreground/70">
                          {formatDistanceToNow(new Date(n.created_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
