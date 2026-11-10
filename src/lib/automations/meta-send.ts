import {
  sendTextMessage,
  sendTemplateMessage,
  sendFlowMessage,
  sendLocationRequest,
} from '@/lib/whatsapp/meta-api';
import type { InteractiveMessagePayload } from '@/lib/whatsapp/interactive';
import {
  engineSendInteractiveButtons,
  engineSendInteractiveList,
} from '@/lib/flows/meta-send';
import { loadAccountMetaCredentials } from '@/lib/whatsapp/account-credentials';
import {
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';
import { resolveContactSendTarget } from '@/lib/whatsapp/wa-identity';
import { assertConversationInAccount } from '@/lib/whatsapp/conversation-scope';
import {
  resolveTemplateRow,
  templateContentText,
  templateHeaderMediaUrl,
} from '@/lib/whatsapp/template-body';
import { supabaseAdmin } from './admin-client';
import { getT } from '@/lib/i18n/translate';

const t = getT('LibErrors');

// ------------------------------------------------------------
// Automation-side Meta sender.
//
// Mirrors the logic in src/app/api/whatsapp/send/route.ts but uses
// the service-role client (engine has no cookies) and accepts the
// user / conversation / contact identifiers the engine already has
// on hand. Kept here (rather than refactoring the user-facing send
// route) to avoid risk to the working manual-send path — they can
// converge in a later refactor.
// ------------------------------------------------------------

interface SendTextArgs {
  /** Account-level tenancy key. Drives contact + whatsapp_config
   *  lookups so an automation authored by user A still sends through
   *  the WhatsApp number user B saved on the same account. */
  accountId: string;
  /** Original author of the automation/flow — used for INSERT audit
   *  columns (messages.sender_id-ish) and for resolving the agent's
   *  identity in logs. Not consulted for tenancy. */
  userId: string;
  conversationId: string;
  contactId: string;
  text: string;
}

interface SendTemplateArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  templateName: string;
  language?: string;
  params?: string[];
}

export async function engineSendText(
  args: SendTextArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'text' });
}

export async function engineSendTemplate(
  args: SendTemplateArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'template' });
}

interface SendInteractiveArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  payload: InteractiveMessagePayload;
}

/**
 * Send an interactive (reply-buttons or list) message from the
 * automation engine.
 *
 * Delegates to the Flows interactive senders
 * (`engineSendInteractiveButtons` / `engineSendInteractiveList`), which
 * already own the account-scoped lookup, phone-variant retry, and the
 * `messages` insert with `interactive_payload` + `sender_type='bot'`.
 * Both engines want identical behaviour here, so there's one
 * implementation rather than a second hand-rolled copy that could drift.
 */
export async function engineSendInteractive(
  args: SendInteractiveArgs
): Promise<{ whatsapp_message_id: string }> {
  const { payload, accountId, userId, conversationId, contactId } = args;
  const common = { accountId, userId, conversationId, contactId };
  if (payload.kind === 'buttons') {
    return engineSendInteractiveButtons({
      ...common,
      bodyText: payload.body,
      headerText: payload.header,
      footerText: payload.footer,
      buttons: payload.buttons,
    });
  }
  if (payload.kind === 'media') {
    return engineSendInteractiveButtons({
      ...common,
      bodyText: payload.body,
      headerText: payload.header,
      footerText: payload.footer,
      buttons: payload.buttons ?? [],
      headerMedia: payload.header_media,
    });
  }
  if (payload.kind === 'audio') {
    throw new Error('Audio quick replies are not supported in automations.');
  }
  if (payload.kind === 'cta' || payload.kind === 'request_contact_info') {
    throw new Error(
      'This interactive quick reply type is not supported in automations.'
    );
  }
  if (payload.kind !== 'list') {
    throw new Error('Unsupported interactive quick reply type.');
  }
  return engineSendInteractiveList({
    ...common,
    bodyText: payload.body,
    buttonLabel: payload.button_label,
    headerText: payload.header,
    footerText: payload.footer,
    sections: payload.sections,
  });
}

interface SendFlowArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  flowId: string;
  flowToken: string;
  flowCta: string;
  bodyText: string;
  headerText?: string;
  footerText?: string;
  screen?: string;
  action?: 'navigate' | 'data_exchange';
  data?: Record<string, unknown>;
}

interface SendLocationRequestArgs {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  bodyText: string;
}

export async function engineSendFlow(
  args: SendFlowArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'flow' });
}

export async function engineSendLocationRequest(
  args: SendLocationRequestArgs
): Promise<{ whatsapp_message_id: string }> {
  return sendViaMeta({ ...args, kind: 'location_request' });
}

type SendInput =
  | (SendTextArgs & { kind: 'text' })
  | (SendTemplateArgs & { kind: 'template' })
  | (SendFlowArgs & { kind: 'flow' })
  | (SendLocationRequestArgs & { kind: 'location_request' });

async function sendViaMeta(
  input: SendInput
): Promise<{ whatsapp_message_id: string }> {
  const db = supabaseAdmin();

  // Scope the contact + config lookups by account_id, not user_id.
  // The engine uses the service-role client (bypassing RLS); without
  // this filter, an authenticated user could fire their own
  // automations against another tenant's contact UUID and send via
  // their own WhatsApp config to that contact's phone. The 017
  // migration moved both tables to account-scoped tenancy, so the
  // check is the same defense-in-depth as before, just keyed on the
  // new tenancy column.
  const { data: contact, error: contactErr } = await db
    .from('contacts')
    .select('id, phone, wa_user_id')
    .eq('id', input.contactId)
    .eq('account_id', input.accountId)
    .maybeSingle();
  if (contactErr || !contact) {
    throw new Error(t('send.contactNotFound'));
  }

  // Same for the conversation the message lands in — see
  // conversation-scope.ts (GHSA-m4fx-g6pr-hrw8).
  await assertConversationInAccount(db, input.conversationId, input.accountId);

  // Phone number, or the business-scoped user ID when Meta has never
  // given us a number for this customer (issue #519).
  const sendTarget = resolveContactSendTarget(contact);
  if (!sendTarget) {
    throw new Error(
      t('send.noWhatsAppAddress', { phone: contact.phone || t('send.none') })
    );
  }
  const sanitized = sendTarget.target;

  let credentials
  try {
    credentials = await loadAccountMetaCredentials(db, input.accountId)
  } catch {
    throw new Error(t('send.notConfigured'));
  }

  const accessToken = credentials.accessToken;

  // Local template row. A missing row is fine: the send still goes
  // out, we just can't reconstruct the text the customer saw.
  const templateRow =
    input.kind === 'template'
      ? (
          await resolveTemplateRow(
            db,
            input.accountId,
            input.templateName,
            input.language
          )
        ).row
      : null;

  const attempt = async (phone: string): Promise<string> => {
    if (input.kind === 'template') {
      const r = await sendTemplateMessage({
        phoneNumberId: credentials.phoneNumberId,
        accessToken,
        to: phone,
        templateName: input.templateName,
        language: input.language,
        template: templateRow ?? undefined,
        params: input.params,
      });
      return r.messageId;
    }
    if (input.kind === 'flow') {
      const r = await sendFlowMessage({
        phoneNumberId: credentials.phoneNumberId,
        accessToken,
        to: phone,
        flowId: input.flowId,
        flowToken: input.flowToken,
        flowCta: input.flowCta,
        bodyText: input.bodyText,
        headerText: input.headerText,
        footerText: input.footerText,
        screen: input.screen,
        action: input.action,
        data: input.data,
      });
      return r.messageId;
    }
    if (input.kind === 'location_request') {
      const r = await sendLocationRequest({
        phoneNumberId: credentials.phoneNumberId,
        accessToken,
        to: phone,
        bodyText: input.bodyText,
      });
      return r.messageId;
    }
    const r = await sendTextMessage({
      phoneNumberId: credentials.phoneNumberId,
      accessToken,
      to: phone,
      text: input.text,
    });
    return r.messageId;
  };

  // Same phone-variant retry as /api/whatsapp/send — Meta sandbox and
  // numbers registered with/without a trunk 0 both require this to
  // reliably land a message.
  const variants = sendTarget.isPhone ? phoneVariants(sanitized) : [sanitized];
  let workingPhone = sanitized;
  let waMessageId = '';
  let lastError: unknown = null;
  for (const v of variants) {
    try {
      waMessageId = await attempt(v);
      workingPhone = v;
      lastError = null;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRecipientNotAllowedError(msg)) throw err;
      lastError = err;
    }
  }
  if (lastError) throw lastError;

  if (sendTarget.isPhone && workingPhone !== sanitized) {
    await db
      .from('contacts')
      .update({ phone: workingPhone })
      .eq('id', contact.id);
  }

  // Persist the sent message so it appears in the inbox with a real
  // Meta message id. sender_type='bot' distinguishes automation sends
  // from manual agent sends.
  const content_type = input.kind === 'template' ? 'template' : 'text';
  // Templates persist the substituted body, same as the manual and
  // public-API send paths. This was unconditionally null, so every
  // automation template send rendered as an empty bubble (issue #483).
  const content_text =
    input.kind === 'text'
      ? input.text
      : input.kind === 'template'
        ? templateContentText(templateRow, input.params ?? [])
        : input.bodyText;
  const template_name = input.kind === 'template' ? input.templateName : null;

  const { error: msgErr } = await db.from('messages').insert({
    conversation_id: input.conversationId,
    sender_type: 'bot',
    content_type,
    content_text,
    media_url: templateHeaderMediaUrl(templateRow),
    template_name,
    message_id: waMessageId,
    status: 'sent',
  });
  if (msgErr) {
    // Meta already has the message; record the DB error but don't pretend
    // the send failed. The engine wraps this in a log line.
    throw new Error(t('send.dbInsertFailed', { message: msgErr.message }));
  }

  await db
    .from('conversations')
    .update({
      last_message_text:
        input.kind === 'template'
          ? (content_text ?? `[template:${input.templateName}]`)
          : content_text,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.conversationId)
    .eq('account_id', input.accountId);

  return { whatsapp_message_id: waMessageId };
}
