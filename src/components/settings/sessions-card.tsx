'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CircleAlert,
  Loader2,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Smartphone,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';

interface ActiveSession {
  id: string;
  created_at: string;
  updated_at: string | null;
  ip: string | null;
  user_agent: string | null;
  is_current: boolean;
}

/** Friendly browser + OS label from a user-agent string. */
function describeDevice(ua: string | null, fallback: string): string {
  if (!ua) return fallback;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : fallback;
}

function isMobileUA(ua: string | null): boolean {
  return !!ua && /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function SessionsCard() {
  const t = useTranslations('Settings.profile');
  const supabase = createClient();
  const [listOpen, setListOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Load on every open so a session created elsewhere shows up without
  // a page refresh.
  useEffect(() => {
    if (!listOpen) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    void supabase.rpc('list_my_sessions').then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setFailed(true);
        setSessions([]);
      } else {
        setSessions((data ?? []) as ActiveSession[]);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [listOpen, supabase]);

  const onConfirm = async () => {
    setSigningOut(true);
    try {
      // scope: 'global' revokes every refresh token for this user
      // across all devices; the next auth-state change on this tab
      // triggers the usual redirect.
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        toast.error(t('signOutFailed', { message: error.message }));
        return;
      }
      window.location.href = '/login';
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('unknownError');
      toast.error(msg);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <LogOut className="size-4 text-primary" />
            {t('sessionsTitle')}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {t('sessionsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => setListOpen(true)}
          >
            <MonitorSmartphone className="size-4" />
            {t('viewSessions')}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="[&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('sessionsTitle')}</DialogTitle>
            <DialogDescription>{t('sessionsDesc')}</DialogDescription>
          </DialogHeader>

          <div className="min-h-[110px]">
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('sessionsLoading')}
              </p>
            ) : failed ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{t('sessionsError')}</span>
              </p>
            ) : sessions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('sessionsEmpty')}
              </p>
            ) : (
              <ul className="max-h-[min(55vh,380px)] space-y-2 overflow-y-auto pr-1">
                {sessions.map((session) => {
                  const mobile = isMobileUA(session.user_agent);
                  const Icon = mobile ? Smartphone : Monitor;
                  const when = formatWhen(
                    session.updated_at ?? session.created_at,
                  );
                  return (
                    <li
                      key={session.id}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-3',
                        session.is_current
                          ? 'border-primary/30 bg-primary-soft'
                          : 'border-border',
                      )}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {describeDevice(
                              session.user_agent,
                              t('unknownDevice'),
                            )}
                          </p>
                          {session.is_current && (
                            <span className="rounded-full border border-primary/30 bg-background/60 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {t('thisDevice')}
                            </span>
                          )}
                        </div>
                        {when && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t('lastActive', { when })}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t('ipAddress')}: {session.ip ?? '—'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setListOpen(false)}
            >
              {t('close')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setListOpen(false);
                setConfirmOpen(true);
              }}
            >
              <LogOut className="size-4" />
              {t('signOutAll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="[&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed">
          <DialogHeader>
            <DialogTitle>{t('signOutConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('signOutConfirmDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={signingOut}
            >
              {t('cancel')}
            </Button>
            <Button type="button" onClick={onConfirm} disabled={signingOut}>
              {signingOut ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('signingOut')}
                </>
              ) : (
                t('signOutEverywhere')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
