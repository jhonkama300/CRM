import { getT } from '@/lib/i18n/translate';

const t = getT('Api');
const META_API_BASE = 'https://graph.facebook.com/v21.0';

export interface ChannelValidationArgs {
  phoneNumberId: string;
  wabaId: string | null;
  accessToken: string;
}

export interface ChannelValidationResult {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  wabaName: string | null;
}

async function graphJson(url: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      `Meta API error ${res.status}`;
    throw new Error(message);
  }
  return data;
}

/**
 * Verify a channel's number/WABA with Meta and subscribe the WABA to
 * this app. Number registration (the two-step PIN call) is handled by
 * the channel routes when the form supplies a PIN, so this helper stays
 * safe to call for credential-only saves and connection tests.
 */
export async function validateChannelCredentials(
  args: ChannelValidationArgs,
): Promise<ChannelValidationResult> {
  const { phoneNumberId, wabaId, accessToken } = args;

  if (!/^\d+$/.test(phoneNumberId)) {
    throw new Error(t('channels.invalidPhoneNumberId'));
  }

  const phone = await graphJson(
    `${META_API_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    accessToken,
  );

  let wabaName: string | null = null;
  if (wabaId) {
    if (!/^\d+$/.test(wabaId)) {
      throw new Error(t('channels.invalidWabaId'));
    }
    const waba = await graphJson(
      `${META_API_BASE}/${wabaId}?fields=id,name`,
      accessToken,
    );
    wabaName = typeof waba?.name === 'string' ? waba.name : null;

    const numbers = await graphJson(
      `${META_API_BASE}/${wabaId}/phone_numbers?fields=id`,
      accessToken,
    );
    const listed = Array.isArray(numbers?.data)
      ? numbers.data.some((row: { id?: string }) => row.id === phoneNumberId)
      : false;
    if (!listed) {
      throw new Error(t('channels.phoneNotInWaba'));
    }

    // Idempotent: re-subscribing an already-subscribed app is fine.
    await graphJson(
      `${META_API_BASE}/${wabaId}/subscribed_apps`,
      accessToken,
      { method: 'POST' },
    );
  }

  return {
    displayPhoneNumber:
      typeof phone?.display_phone_number === 'string'
        ? phone.display_phone_number
        : null,
    verifiedName:
      typeof phone?.verified_name === 'string' ? phone.verified_name : null,
    wabaName,
  };
}
