'use client';

// ============================================================
// /auth/invite - landing page for Supabase's invitation email.
//
// Admin-generated invitations can come back in two shapes:
//   - ?code=...          PKCE (exchange server-side normally does this)
//   - #access_token=...  implicit flow (admin invite default)
//
// A server route can't read the URL fragment, so invitations get a
// small client page. The browser client picks up the session from
// the fragment automatically; the code path is exchanged explicitly
// for projects configured with PKCE. Once a session exists we move
// to the dashboard.
// ============================================================

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export default function InviteLandingPage() {
  const t = useTranslations('JoinPage');

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.location.replace('/dashboard');
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      window.location.replace('/login?error=link_invalid');
    };

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const tokenHash = params.get('token_hash');
    const otpType = params.get('type');
    if (params.get('error') || params.get('error_code')) {
      fail();
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    void (async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          fail();
          return;
        }
        finish();
        return;
      }

      if (tokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType as EmailOtpType,
        });
        if (error) {
          fail();
          return;
        }
        finish();
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) finish();
    })();

    const timeout = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) finish();
      else fail();
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <Card className="border-border bg-card w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-3 py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
        <p className="text-muted-foreground text-sm">{t('verifying')}</p>
      </CardContent>
    </Card>
  );
}
