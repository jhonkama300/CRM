// ============================================================
// /api/account/users
//
//   POST - create a member directly, or invite them by email.
//
// The Members / Company screens offer three ways to onboard a
// teammate:
//   1. shareable invite link  -> POST /api/account/invitations
//   2. email invitation       -> this route, mode="email"
//   3. create a user          -> this route, mode="create"
//
// Email invitations and direct creation both mint an auth user up
// front, so the person appears in the roster immediately. The signup
// trigger gives every new auth user a personal account; this route
// moves their profile into the caller's account and removes the
// (empty) personal account the trigger created.
//
// Service-role is required because we're crossing auth + RLS
// boundaries. Admin+ is enforced before any of that happens.
// ============================================================

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isAccountRole } from '@/lib/auth/roles';
import { recordAudit } from '@/lib/audit/log';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { getT } from '@/lib/i18n/translate';

const t = getT('Api');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 120;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_NAME_LEN);
}

function resolveBaseUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  if (forwardedHost) {
    return `${forwardedProto || 'https'}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');

    const limit = checkRateLimit(
      `admin:userCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      mode?: unknown;
      email?: unknown;
      firstName?: unknown;
      lastName?: unknown;
      role?: unknown;
      departmentId?: unknown;
      sendInvite?: unknown;
    } | null;

    const mode = body?.mode === 'create' ? 'create' : 'email';
    const email = normalizeEmail(body?.email);
    if (!email) {
      return NextResponse.json(
        { error: t('account.users.emailInvalid') },
        { status: 400 }
      );
    }

    const role = body?.role;
    if (!isAccountRole(role) || role === 'owner') {
      return NextResponse.json(
        { error: t('account.users.roleInvalid') },
        { status: 400 }
      );
    }

    const firstName = normalizeName(body?.firstName);
    const lastName = normalizeName(body?.lastName);
    const fullName =
      [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0];

    const departmentId =
      typeof body?.departmentId === 'string' && body.departmentId.trim()
        ? body.departmentId.trim()
        : null;

    // `mode="email"` always sends the invitation. Direct creation
    // honours the "Don't send invitation" checkbox.
    const sendInvite = mode === 'email' ? true : body?.sendInvite !== false;

    const admin = supabaseAdmin();

    if (departmentId) {
      const { data: department } = await admin
        .from('departments')
        .select('id')
        .eq('id', departmentId)
        .eq('account_id', ctx.accountId)
        .maybeSingle();
      if (!department) {
        return NextResponse.json(
          { error: t('account.invitations.departmentInvalid') },
          { status: 400 }
        );
      }
    }

    // Fail early with a clear message when the email is already in
    // use. `profiles.email` is the roster's source of truth; auth
    // users without a profile are healed by the signup trigger.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('user_id, account_id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        {
          error:
            existingProfile.account_id === ctx.accountId
              ? t('account.users.alreadyMember')
              : t('account.users.alreadyRegistered'),
        },
        { status: 409 }
      );
    }

    let userId: string | null = null;
    let temporaryPassword: string | undefined;

    if (sendInvite) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: `${resolveBaseUrl(request)}/auth/invite`,
      });
      if (error || !data.user) {
        console.error('[POST /api/account/users] invite error:', error);
        const message = error?.message ?? '';
        return NextResponse.json(
          {
            error: /already|registered|exists/i.test(message)
              ? t('account.users.alreadyRegistered')
              : t('account.users.inviteFailed'),
          },
          { status: /already|registered|exists/i.test(message) ? 409 : 500 }
        );
      }
      userId = data.user.id;
    } else {
      temporaryPassword = randomBytes(12).toString('base64url');
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data.user) {
        console.error('[POST /api/account/users] create error:', error);
        const message = error?.message ?? '';
        return NextResponse.json(
          {
            error: /already|registered|exists/i.test(message)
              ? t('account.users.alreadyRegistered')
              : t('account.users.createFailed'),
          },
          { status: /already|registered|exists/i.test(message) ? 409 : 500 }
        );
      }
      userId = data.user.id;
    }

    // From here on the auth user exists. Any failure must delete it
    // again so we don't leave a half-linked account behind.
    try {
      const { data: profile, error: profileLookupError } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileLookupError) throw profileLookupError;

      const profilePatch = {
        full_name: fullName,
        email,
        account_id: ctx.accountId,
        account_role: role,
      };

      const { error: profileWriteError } = profile
        ? await admin
            .from('profiles')
            .update(profilePatch)
            .eq('user_id', userId)
        : await admin
            .from('profiles')
            .insert({ user_id: userId, ...profilePatch });

      if (profileWriteError) throw profileWriteError;

      if (departmentId) {
        const { error: departmentError } = await admin
          .from('department_members')
          .upsert(
            {
              account_id: ctx.accountId,
              department_id: departmentId,
              user_id: userId,
              role: 'agent',
            },
            { onConflict: 'department_id,user_id' }
          );
        if (departmentError) throw departmentError;
      }

      // The signup trigger creates a personal account for the new
      // auth user. Their profile now points at the team account, so
      // that empty shell can be removed.
      const { error: cleanupError } = await admin
        .from('accounts')
        .delete()
        .eq('owner_user_id', userId)
        .neq('id', ctx.accountId);
      if (cleanupError) {
        // Non-fatal: an orphan empty account is harmless. Log it so
        // operators can clean it up if it ever piles up.
        console.warn(
          '[POST /api/account/users] orphan account cleanup failed:',
          cleanupError
        );
      }

      await recordAudit({
        accountId: ctx.accountId,
        actorUserId: ctx.userId,
        action: sendInvite ? 'member.invited' : 'member.created',
        entityType: 'member',
        entityId: userId,
        metadata: {
          email,
          role,
          department_id: departmentId,
          invited: sendInvite,
        },
      });

      return NextResponse.json(
        {
          user: { id: userId, email },
          invited: sendInvite,
          temporaryPassword,
        },
        { status: 201 }
      );
    } catch (linkError) {
      console.error(
        '[POST /api/account/users] linking new user failed:',
        linkError
      );
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      return NextResponse.json(
        { error: t('account.users.createFailed') },
        { status: 500 }
      );
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
