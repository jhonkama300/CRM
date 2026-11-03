'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload, Trash2, Mail, CircleAlert } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { useTranslations } from 'next-intl';
import { BrowserNotificationsCard } from './browser-notifications-card';
import { SettingsChip } from './settings-chip';
import { ROLE_META } from './role-meta';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

// Rough email shape check — the real validator is Supabase Auth, which
// rejects anything malformed when we call updateUser({ email }). We
// just want to stop obvious typos before making a network call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ProfileForm() {
  const t = useTranslations('Settings.profile');
  const tRoles = useTranslations('Settings.roles');
  const { user, profile, refreshProfile, accountRole } = useAuth();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailChangePending, setEmailChangePending] = useState(false);

  // Seed form state once the profile loads.
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setEmail(profile.email ?? '');
  }, [profile]);

  // Cleanup object URLs to avoid leaks.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentAvatar =
    previewUrl ?? (!removeAvatar ? profile?.avatar_url ?? null : null);

  const initial = (fullName || profile?.full_name || profile?.email || 'U')
    .charAt(0)
    .toUpperCase();
  const roleMeta = accountRole ? ROLE_META[accountRole] : null;
  const RoleIcon = roleMeta?.icon;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-picked
    if (!file) return;

    if (!ALLOWED_MIME.has(file.type)) {
      toast.error(t('unsupportedImage'), {
        description: t('unsupportedImageDesc'),
      });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(t('imageTooLarge'), {
        description: t('imageTooLargeDesc'),
      });
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingAvatar(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRemoveAvatar(false);
  };

  const onRemoveAvatar = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingAvatar(null);
    setPreviewUrl(null);
    setRemoveAvatar(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error(t('nameRequired'));
      return;
    }
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      toast.error(t('invalidEmail'));
      return;
    }

    setSaving(true);
    try {
      let nextAvatarUrl: string | null = profile.avatar_url ?? null;

      // Upload a newly-staged image, if any.
      if (pendingAvatar) {
        const ext =
          pendingAvatar.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, pendingAvatar, {
            cacheControl: '3600',
            upsert: true,
            contentType: pendingAvatar.type,
          });
        if (uploadError) {
          throw new Error(t('uploadFailed', { message: uploadError.message }));
        }
        const {
          data: { publicUrl },
        } = supabase.storage.from('avatars').getPublicUrl(path);
        nextAvatarUrl = publicUrl;
      } else if (removeAvatar) {
        nextAvatarUrl = null;
      }

      // Persist name + avatar to profiles.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: trimmedName,
          avatar_url: nextAvatarUrl,
        })
        .eq('user_id', user.id);
      if (updateError) {
        throw new Error(t('saveFailed', { message: updateError.message }));
      }

      // Email change goes through Supabase Auth, which emails a
      // confirmation to both the old and new addresses. We don't
      // touch profiles.email — Supabase will push the change there
      // after the user clicks the link (handled by the handle_new_user
      // trigger pattern in production deployments).
      let emailSent = false;
      if (trimmedEmail.toLowerCase() !== profile.email.toLowerCase()) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: trimmedEmail,
        });
        if (emailError) {
          // Partial success: name/avatar saved but email didn't.
          toast.success(t('profileSaved'));
          toast.error(t('emailChangeFailed', { message: emailError.message }));
          setSaving(false);
          await refreshProfile();
          return;
        }
        emailSent = true;
      }

      setEmailChangePending(emailSent);
      setPendingAvatar(null);
      setPreviewUrl(null);
      setRemoveAvatar(false);
      await refreshProfile();

      toast.success(
        emailSent
          ? t('profileSavedEmailCheck')
          : t('profileSaved'),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('unknownError');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    !!profile &&
    (fullName.trim() !== (profile.full_name ?? '') ||
      email.trim().toLowerCase() !== (profile.email ?? '').toLowerCase() ||
      pendingAvatar !== null ||
      removeAvatar);

  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Identity card - photo, role and immutable account metadata.
            The editable fields get their own column so the eye lands on
            the person first, then on the form. */}
        <aside className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col items-center text-center">
            <Avatar size="lg" className="size-16 ring-2 ring-border">
              {currentAvatar ? (
                <AvatarImage
                  src={currentAvatar}
                  alt={fullName || t('avatarAlt')}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-lg text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>

            <p className="mt-2 w-full truncate text-base font-semibold text-foreground">
              {fullName.trim() || profile?.full_name || profile?.email || '-'}
            </p>
            <p className="w-full truncate text-sm text-muted-foreground">
              {profile?.email ?? '-'}
            </p>
            {accountRole && roleMeta && RoleIcon ? (
              <div className="mt-1.5">
                <SettingsChip variant={roleMeta.variant}>
                  <RoleIcon />
                  {tRoles(accountRole)}
                </SettingsChip>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onPickFile}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              <Upload className="size-4" />
              {currentAvatar ? t('changePhoto') : t('uploadPhoto')}
            </Button>
            {currentAvatar && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={onRemoveAvatar}
                disabled={saving}
              >
                <Trash2 className="size-4" />
                {t('remove')}
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {t('photoHint')}
          </p>

          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {t('accountDetails')}
            </p>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t('joined')}</dt>
                <dd className="text-right text-foreground">{joined}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t('userId')}
                </dt>
                <dd
                  className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                  title={user?.id ?? undefined}
                >
                  {user?.id ?? '-'}
                </dd>
              </div>
            </dl>
          </div>
        </aside>

        {/* Editable fields. */}
        <div className="min-w-0 rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {t('personalInfo')}
          </h3>
          <form onSubmit={onSubmit} className="mt-3">
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-full-name" className="text-foreground">
                  {t('displayName')}
                </Label>
                <Input
                  id="profile-full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t('fullNamePlaceholder')}
                  maxLength={120}
                  disabled={saving}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email" className="text-foreground">
                  {t('email')}
                </Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>

              {emailChangePending && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 xl:col-span-2 dark:text-amber-300">
                  <Mail className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {t.rich('emailChangeHint', {
                      oldEmail: profile?.email || '',
                      newEmail: email,
                      bold: (chunks: React.ReactNode) => (
                        <strong>{chunks}</strong>
                      ),
                    })}
                  </span>
                </p>
              )}
            </div>

            {!profile && (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <CircleAlert className="size-4" />
                {t('loading')}
              </p>
            )}

            <div className="mt-4 flex justify-end border-t border-border pt-3">
              <Button type="submit" disabled={saving || !dirty || !profile}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('saving')}
                  </>
                ) : (
                  t('saveChanges')
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Device-scoped, so it lives outside the profile form and its
          Save button - flipping the switch applies immediately. */}
      <BrowserNotificationsCard className="mt-4" />
    </section>
  );
}
