import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getT } from '@/lib/i18n/translate';

const t = getT('Api');

const DEFAULTS = {
  firstResponseMinutes: 3,
  betweenMessagesMinutes: 5,
  pendingAlertMinutes: 5,
  criticalMinutes: 10,
  useBusinessHours: false,
  timezone: 'America/Bogota',
  workdayStart: '08:00',
  workdayEnd: '18:00',
  workdays: [1, 2, 3, 4, 5],
};

interface SlaRow {
  first_response_minutes: number;
  between_messages_minutes: number;
  pending_alert_minutes: number;
  critical_minutes: number;
  use_business_hours: boolean;
  timezone: string;
  workday_start: string;
  workday_end: string;
  workdays: number[];
}

function serialize(row: SlaRow | null) {
  if (!row) return DEFAULTS;
  return {
    firstResponseMinutes: row.first_response_minutes,
    betweenMessagesMinutes: row.between_messages_minutes,
    pendingAlertMinutes: row.pending_alert_minutes,
    criticalMinutes: row.critical_minutes,
    useBusinessHours: row.use_business_hours,
    timezone: row.timezone,
    workdayStart: row.workday_start?.slice(0, 5) ?? DEFAULTS.workdayStart,
    workdayEnd: row.workday_end?.slice(0, 5) ?? DEFAULTS.workdayEnd,
    workdays: row.workdays ?? DEFAULTS.workdays,
  };
}

function validMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 1440
  );
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin');

    const { data, error } = await supabase
      .from('account_sla_settings')
      .select(
        'first_response_minutes, between_messages_minutes, pending_alert_minutes, critical_minutes, use_business_hours, timezone, workday_start, workday_end, workdays'
      )
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) {
      console.error('[metrics/sla GET] error:', error);
      return NextResponse.json(
        { error: t('metrics.slaLoadFailed') },
        { status: 500 }
      );
    }

    return NextResponse.json(serialize(data as SlaRow | null));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const body = (await request.json()) as Record<string, unknown>;

    if (
      !validMinutes(body.firstResponseMinutes) ||
      !validMinutes(body.betweenMessagesMinutes) ||
      !validMinutes(body.pendingAlertMinutes) ||
      !validMinutes(body.criticalMinutes) ||
      typeof body.useBusinessHours !== 'boolean' ||
      !validTimeZone(body.timezone) ||
      !validTime(body.workdayStart) ||
      !validTime(body.workdayEnd) ||
      !Array.isArray(body.workdays) ||
      body.workdays.length === 0 ||
      !body.workdays.every(
        (day) =>
          typeof day === 'number' &&
          Number.isInteger(day) &&
          day >= 0 &&
          day <= 6
      )
    ) {
      return NextResponse.json(
        { error: t('metrics.invalidParams') },
        { status: 400 }
      );
    }

    const workdays = [...new Set(body.workdays as number[])].sort(
      (a, b) => a - b
    );

    const { data, error } = await supabase
      .from('account_sla_settings')
      .upsert(
        {
          account_id: accountId,
          first_response_minutes: body.firstResponseMinutes,
          between_messages_minutes: body.betweenMessagesMinutes,
          pending_alert_minutes: body.pendingAlertMinutes,
          critical_minutes: body.criticalMinutes,
          use_business_hours: body.useBusinessHours,
          timezone: body.timezone,
          workday_start: body.workdayStart,
          workday_end: body.workdayEnd,
          workdays,
        },
        { onConflict: 'account_id' }
      )
      .select(
        'first_response_minutes, between_messages_minutes, pending_alert_minutes, critical_minutes, use_business_hours, timezone, workday_start, workday_end, workdays'
      )
      .single();

    if (error) {
      console.error('[metrics/sla PUT] error:', error);
      return NextResponse.json(
        { error: t('metrics.slaUpdateFailed') },
        { status: 500 }
      );
    }

    return NextResponse.json(serialize(data as SlaRow));
  } catch (err) {
    return toErrorResponse(err);
  }
}
