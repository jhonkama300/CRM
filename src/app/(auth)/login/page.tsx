'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { XylarGlyph } from '@/components/brand-mark';
import { BRAND_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ChartNoAxesColumn,
  Eye,
  EyeOff,
  Inbox,
  Loader2,
  Zap,
} from 'lucide-react';

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get('invite');
  const t = useTranslations('LoginPage');
  // Set by /auth/callback when an emailed link (confirmation, password
  // reset) could not be turned into a session — see src/lib/auth/callback.ts.
  const linkError = searchParams.get('error');
  const linkErrorMessage =
    linkError === 'link_expired'
      ? t('linkExpired')
      : linkError === 'link_invalid'
        ? t('linkInvalid')
        : null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      // Supabase's messages are English-only server strings. Translate
      // the cases a person can actually act on, and keep the raw
      // message as the fallback for everything else.
      setError(
        error.code === 'invalid_credentials'
          ? t('errorInvalidCredentials')
          : error.code === 'email_not_confirmed'
            ? t('errorEmailNotConfirmed')
            : error.code === 'over_request_rate_limit'
              ? t('errorTooManyAttempts')
              : error.message
      );
      setLoading(false);
      return;
    }

    // Full-page navigation (not router.push) so the browser issues a
    // fresh top-level request that carries the just-written Supabase
    // auth cookies to the middleware gating /dashboard. A soft
    // client-side navigation can reach the protected route before the
    // server observes the new session, so the middleware bounces it
    // back to /login — which looks like the page "just refreshing"
    // instead of signing in (issue #365). Mirrors the deliberate full
    // reload the invite-accept flow already uses in join/[token].
    const destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : '/dashboard';
    window.location.href = destination;
  };

  return (
    <div className="min-h-dvh bg-[#07040e] text-white light:bg-[#f6f4fa] lg:grid lg:grid-cols-2">
      <MarketingPanel />

      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 light:text-[#171122] sm:px-8 sm:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_50%_0%,rgba(124,58,237,0.2),transparent_60%),radial-gradient(110%_100%_at_0%_100%,rgba(124,58,237,0.14),transparent_55%)] light:bg-[radial-gradient(80%_50%_at_50%_0%,rgba(124,58,237,0.12),transparent_60%),radial-gradient(110%_100%_at_0%_100%,rgba(124,58,237,0.1),transparent_55%)]"
        />

        <div className="relative w-full max-w-[420px] rounded-[28px] bg-[linear-gradient(180deg,rgba(167,139,250,0.55),rgba(255,255,255,0.06)_28%,rgba(255,255,255,0.04)_72%,rgba(167,139,250,0.4))] p-px shadow-[0_0_90px_-18px_rgba(124,58,237,0.65)] light:bg-[linear-gradient(180deg,rgba(139,92,246,0.5),rgba(23,17,34,0.08)_32%,rgba(23,17,34,0.06)_68%,rgba(139,92,246,0.35))] light:shadow-[0_24px_70px_-30px_rgba(76,29,149,0.35)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700">
          <div className="relative overflow-hidden rounded-[27px] bg-[#0b0714]/95 px-6 py-9 backdrop-blur-xl light:bg-white/95 sm:px-9">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#8b5cf6]/20 blur-3xl light:bg-[#8b5cf6]/10"
            />
            <header className="flex flex-col items-center text-center">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[linear-gradient(145deg,#8b5cf6,#6d28d9)] text-white ring-1 ring-white/15 ring-inset shadow-[0_0_28px_-6px_rgba(139,92,246,0.9)]">
                  <XylarGlyph className="h-5 w-5" />
                </div>
                <span className="text-[17px] font-semibold tracking-[-0.01em] text-white light:text-[#171122]">
                  {BRAND_NAME}
                </span>
              </div>

              <h1 className="mt-7 text-[27px] leading-tight font-semibold tracking-[-0.02em] text-balance text-white light:text-[#171122]">
                {inviteToken ? t('titleAccept') : t('titleWelcome')}
              </h1>
              <p className="mt-2 max-w-[19rem] text-[13px] leading-relaxed text-balance text-white/55 light:text-[#5f586e]">
                {inviteToken ? t('descAccept') : t('descWelcome')}
              </p>
            </header>

            <div aria-live="polite">
              {linkErrorMessage && !error && (
                <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-left text-[13px] leading-relaxed text-amber-200 light:border-amber-500/30 light:bg-amber-50 light:text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{linkErrorMessage}</span>
                </div>
              )}
              {error && (
                <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-[13px] leading-relaxed text-red-300 light:border-red-500/25 light:bg-red-50 light:text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="email"
                  className="text-[13px] font-semibold text-white/90 light:text-[#2a2336]"
                >
                  {t('emailLabel')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="next"
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-11 rounded-xl border-white/[0.12] bg-white/[0.05] px-3.5 text-sm text-white placeholder:text-white/35 light:border-black/10 light:bg-[#f7f5fb] light:text-[#171122] light:placeholder:text-[#8b8399] focus-visible:border-[#8b5cf6]/60 focus-visible:ring-[#8b5cf6]/20"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="password"
                  className="text-[13px] font-semibold text-white/90 light:text-[#2a2336]"
                >
                  {t('passwordLabel')}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    placeholder={t('passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) =>
                      setCapsLockOn(e.getModifierState('CapsLock'))
                    }
                    onKeyUp={(e) =>
                      setCapsLockOn(e.getModifierState('CapsLock'))
                    }
                    onBlur={() => setCapsLockOn(false)}
                    required
                    disabled={loading}
                    className="h-11 rounded-xl border-white/[0.12] bg-white/[0.05] pr-11 pl-3.5 text-sm text-white placeholder:text-white/35 light:border-black/10 light:bg-[#f7f5fb] light:text-[#171122] light:placeholder:text-[#8b8399] focus-visible:border-[#8b5cf6]/60 focus-visible:ring-[#8b5cf6]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={
                      showPassword ? t('hidePassword') : t('showPassword')
                    }
                    aria-pressed={showPassword}
                    disabled={loading}
                    className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/40 transition-colors light:text-[#7a7288] hover:bg-white/10 hover:text-white light:hover:bg-black/5 light:hover:text-[#171122] focus-visible:ring-3 focus-visible:ring-[#8b5cf6]/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {/* Below the input so Tab goes email -> password -> toggle -> link. */}
                <div className="flex min-h-5 items-center gap-3">
                  <span
                    aria-live="polite"
                    className="flex items-center gap-1 text-[12px] text-amber-300/90 light:text-amber-700"
                  >
                    {capsLockOn && (
                      <>
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {t('capsLockOn')}
                      </>
                    )}
                  </span>
                  <Link
                    href="/forgot-password"
                    className="ml-auto shrink-0 rounded text-[13px] font-medium text-[#a78bfa] transition-colors light:text-[#6d28d9] hover:text-[#c4b5fd] light:hover:text-[#5b21b6] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0714] light:focus-visible:ring-offset-white focus-visible:outline-none"
                  >
                    {t('forgotPassword')}
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="mt-1 h-11 w-full gap-2 rounded-xl border-0 bg-[linear-gradient(90deg,#7c3aed,#8b5cf6_55%,#a855f7)] text-sm font-semibold text-white shadow-[0_18px_45px_-12px_rgba(139,92,246,0.9)] light:shadow-[0_16px_40px_-14px_rgba(124,58,237,0.5)] transition-[filter,transform] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/60 light:focus-visible:ring-[#6d28d9]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0714] light:focus-visible:ring-offset-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                )}
                {loading ? t('signingIn') : t('signIn')}
              </Button>
            </form>

            <p className="mt-8 border-t border-white/10 pt-6 text-center text-[13px] text-white/55 light:border-black/10 light:text-[#6b6379] sm:text-sm">
              {t('noAccount')}{' '}
              <Link
                href={
                  inviteToken
                    ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                    : '/signup'
                }
                className="rounded font-medium text-[#a78bfa] transition-colors light:text-[#6d28d9] hover:text-[#c4b5fd] light:hover:text-[#5b21b6] focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0714] light:focus-visible:ring-offset-white focus-visible:outline-none"
              >
                {t('createAccount')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Left half of the login screen: brand statement plus a still of the
// product. It is decorative — hidden below lg, where the card carries
// the brand on its own and uses the full width.
function MarketingPanel() {
  const t = useTranslations('LoginPage');

  return (
    <section className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#2b1157_0%,#1b0b36_46%,#0b0617_100%)] lg:flex lg:flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/3 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-[#7c3aed]/35 blur-[120px]" />
        <div className="absolute bottom-[-8rem] left-[-6rem] h-[30rem] w-[30rem] rounded-full bg-[#a855f7]/15 blur-[110px]" />
        <Waves />
      </div>

      <div className="relative z-10 flex h-full w-full flex-col justify-center px-8 py-14 xl:px-14">
        <div className="mx-auto w-full max-w-[720px]">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#8b5cf6,#6d28d9)] text-white ring-1 ring-white/15 ring-inset shadow-[0_0_30px_-4px_rgba(139,92,246,0.9)]">
                <XylarGlyph className="h-6 w-6" />
              </div>
              <span className="text-2xl font-semibold tracking-[-0.02em] text-white">
                {BRAND_NAME}{' '}
                <span className="font-normal text-white/55">CRM</span>
              </span>
            </div>
            <p className="mt-3 text-[15px] text-white/60">{t('tagline')}</p>
          </div>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {[
              { icon: Inbox, label: t('featureSharedInbox') },
              { icon: Zap, label: t('featureAutomations') },
              { icon: ChartNoAxesColumn, label: t('featureInsights') },
            ].map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm"
              >
                <Icon className="h-3.5 w-3.5 text-[#c4b5fd]" />
                {label}
              </li>
            ))}
          </ul>

          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}

// Decorative dashboard still that anchors the left half. Everything is
// built from divs so it inherits the panel's scale instead of shipping
// a screenshot asset that would go stale.
function DashboardPreview() {
  const t = useTranslations('LoginPage.preview');
  const nav = useTranslations('Sidebar');
  const bars = [38, 62, 44, 80, 56, 72, 48, 92, 64, 78, 52, 70];
  const navItems = [
    { key: 'dashboard', label: nav('dashboard') },
    { key: 'inbox', label: nav('inbox') },
    { key: 'contacts', label: nav('contacts') },
    { key: 'pipelines', label: nav('pipelines') },
    { key: 'broadcasts', label: nav('broadcasts') },
    { key: 'automations', label: nav('automations') },
    { key: 'settings', label: nav('settings') },
  ];
  const metrics = [
    { label: t('conversations'), width: 82 },
    { label: t('responseTime'), width: 64 },
    { label: t('resolution'), width: 74 },
    { label: t('satisfaction'), width: 58 },
    { label: t('coverage'), width: 69 },
  ];
  const events = [
    {
      initials: 'AS',
      name: 'Ana Souza',
      tag: t('tagNew'),
      tone: 'bg-emerald-400/20 text-emerald-300',
    },
    {
      initials: 'MT',
      name: 'Marco Tucci',
      tag: t('tagOpen'),
      tone: 'bg-violet-400/20 text-violet-300',
    },
    {
      initials: 'JL',
      name: 'Jin Lee',
      tag: t('tagWon'),
      tone: 'bg-sky-400/20 text-sky-300',
    },
  ];

  return (
    <div
      aria-hidden
      className="relative mt-9 select-none motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-1000"
    >
      <div className="absolute -inset-6 rounded-[36px] bg-[#7c3aed]/15 blur-3xl" />
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0813] shadow-[0_30px_70px_-28px_rgba(0,0,0,0.9)]">
        <div className="flex">
          {/* Sidebar */}
          <div className="w-[112px] shrink-0 border-r border-white/[0.06] p-3">
            <div className="flex items-center gap-1.5 px-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#7c3aed] text-white">
                <XylarGlyph className="h-3 w-3" />
              </span>
              <span className="text-[9px] font-semibold text-white">
                {BRAND_NAME}
              </span>
            </div>

            <div className="mt-4 space-y-0.5">
              {navItems.map((item, i) => (
                <div
                  key={item.key}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-1.5 py-1 text-[7px] whitespace-nowrap text-white/35',
                    i === 0 && 'bg-white/[0.07] text-white'
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-[2px] bg-current opacity-60" />
                  {item.label}
                  {item.key === 'inbox' && (
                    <span className="ml-auto h-1 w-2.5 rounded-full bg-[#8b5cf6]/70" />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-1.5 px-1">
              <div className="h-1 w-10 rounded-full bg-white/10" />
              <div className="h-1 w-8 rounded-full bg-white/[0.07]" />
              <div className="h-1 w-11 rounded-full bg-white/[0.07]" />
            </div>
          </div>

          {/* Main pane */}
          <div className="min-w-0 flex-1 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold text-white">
                {nav('dashboard')}
              </span>
              <div className="flex items-center gap-1">
                <span className="h-2.5 w-14 rounded-full border border-white/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              {[
                {
                  label: t('revenue'),
                  value: '$21.3M',
                  delta: '+12.4%',
                  up: true,
                },
                {
                  label: t('activeChats'),
                  value: '1.89k',
                  delta: '+8.1%',
                  up: true,
                },
                {
                  label: t('closedDeals'),
                  value: '6.2k',
                  delta: '-2.3%',
                  up: false,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2"
                >
                  <div className="text-[6px] text-white/35">{stat.label}</div>
                  <div className="mt-0.5 text-[10px] font-semibold text-white">
                    {stat.value}
                  </div>
                  <div
                    className={cn(
                      'mt-0.5 text-[6px]',
                      stat.up ? 'text-emerald-400' : 'text-red-400'
                    )}
                  >
                    {stat.delta}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-1.5 flex gap-1.5">
              <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[7px] font-medium text-white/80">
                    {t('visualizations')}
                  </span>
                  <div className="flex gap-1.5">
                    {[t('chats'), t('deals'), t('calls')].map((legend, i) => (
                      <span
                        key={legend}
                        className="flex items-center gap-0.5 text-[5px] text-white/30"
                      >
                        <span
                          className={cn(
                            'h-1 w-1 rounded-full',
                            i === 0
                              ? 'bg-[#a78bfa]'
                              : i === 1
                                ? 'bg-sky-400'
                                : 'bg-emerald-400'
                          )}
                        />
                        {legend}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex h-16 items-end gap-[3px]">
                  {bars.map((height, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-[1px] bg-[linear-gradient(180deg,#c4b5fd,#7c3aed)]"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="w-[104px] rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
                <div className="text-[7px] font-medium text-white/80">
                  {t('metricEvents')}
                </div>
                <div className="mt-2 space-y-1.5">
                  {metrics.map((metric) => (
                    <div key={metric.label}>
                      <div className="flex items-center justify-between text-[5px] text-white/35">
                        <span>{metric.label}</span>
                        <span>{metric.width}%</span>
                      </div>
                      <div className="mt-0.5 h-[2px] rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[#8b5cf6]"
                          style={{ width: `${metric.width}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2">
              <div className="flex items-center justify-between">
                <span className="text-[7px] font-medium text-white/80">
                  {t('newEvents')}
                </span>
                <span className="text-[5px] text-white/30">{t('viewAll')}</span>
              </div>
              <div className="mt-1.5 space-y-1">
                {events.map((event) => (
                  <div key={event.name} className="flex items-center gap-1.5">
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/10 text-[4px] font-semibold text-white/60">
                      {event.initials}
                    </span>
                    <span className="text-[6px] text-white/55">
                      {event.name}
                    </span>
                    <span className="h-[2px] flex-1 rounded-full bg-white/10" />
                    <span
                      className={cn(
                        'rounded-full px-1 py-px text-[4px] font-medium',
                        event.tone
                      )}
                    >
                      {event.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating glass chips — the product still "breaks out" of its
          frame the way the reference does. */}
      <div className="absolute -top-7 right-1 w-36 rounded-lg border border-white/10 bg-white/10 p-2 shadow-xl backdrop-blur-md">
        <div className="h-1 w-12 rounded-full bg-white/25" />
        <div className="mt-1 text-[10px] font-semibold text-white/80 blur-[0.6px]">
          +$10.34M
        </div>
        <div className="mt-1 flex h-4 items-end gap-[2px]">
          {[30, 55, 42, 70, 60, 84, 66].map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-[1px] bg-[#c4b5fd]/70"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>

      <div className="absolute top-[42%] -left-5 flex w-28 items-center gap-1.5 rounded-lg border border-white/10 bg-emerald-400/15 p-1.5 shadow-xl backdrop-blur-md">
        <span className="h-4 w-4 rounded-full bg-emerald-400/40" />
        <span className="space-y-1">
          <span className="block h-1 w-14 rounded-full bg-white/25" />
          <span className="block h-1 w-9 rounded-full bg-white/15" />
        </span>
      </div>

      <div className="absolute -bottom-9 -left-6 w-40 rounded-lg border border-white/10 bg-white/[0.08] p-2 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded-full bg-white/20" />
          <span className="h-1 w-16 rounded-full bg-white/25" />
        </div>
        <div className="mt-1.5 flex gap-1">
          <span className="h-3 flex-1 rounded bg-white/15" />
          <span className="h-3 w-8 rounded bg-[#8b5cf6]/60" />
        </div>
      </div>

      <div className="absolute -right-2 -bottom-6 w-24 rounded-lg border border-white/10 bg-white/[0.08] p-1.5 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-[#8b5cf6] text-[8px] text-white">
            +
          </span>
          <span className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="mt-1 flex gap-1">
          <span className="h-2.5 flex-1 rounded bg-white/15" />
          <span className="h-2.5 flex-1 rounded bg-white/15" />
        </div>
      </div>
    </div>
  );
}

function Waves() {
  return (
    <svg
      viewBox="0 0 560 380"
      fill="none"
      className="absolute bottom-[-60px] left-[-80px] h-[380px] w-[560px] text-[#7c3aed]"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d={`M-20 ${250 + i * 16} Q 120 ${150 + i * 16} 300 ${232 + i * 12} T 600 ${196 + i * 14}`}
          stroke="currentColor"
          strokeWidth={i === 0 ? 1.5 : 1}
          opacity={0.36 - i * 0.045}
        />
      ))}
    </svg>
  );
}
