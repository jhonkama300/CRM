import { supabaseAdmin } from '@/lib/flows/admin-client'

export interface EnsureChannelDealArgs {
  accountId: string
  userId: string
  contactId: string
  conversationId: string
  channelId: string | null
  contactName?: string | null
  contactPhone?: string | null
}

export async function ensureChannelDeal(
  args: EnsureChannelDealArgs,
): Promise<string | null> {
  if (!args.channelId) return null

  const db = supabaseAdmin()

  const { data: pipeline, error: pipelineError } = await db
    .from('pipelines')
    .select('id, user_id')
    .eq('account_id', args.accountId)
    .eq('channel_id', args.channelId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (pipelineError || !pipeline) return null

  const { data: channel } = await db
    .from('channels')
    .select('name')
    .eq('id', args.channelId)
    .eq('account_id', args.accountId)
    .maybeSingle()

  const { data: stage, error: stageError } = await db
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipeline.id)
    .eq('stage_type', 'start')
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (stageError || !stage) return null

  const { data: existing } = await db
    .from('deals')
    .select('id')
    .eq('conversation_id', args.conversationId)
    .eq('pipeline_id', pipeline.id)
    .maybeSingle()

  if (existing?.id) return existing.id as string

  const { data: account } = await db
    .from('accounts')
    .select('default_currency')
    .eq('id', args.accountId)
    .maybeSingle()

  const chatName =
    args.contactName?.trim() ||
    args.contactPhone?.trim() ||
    'Nuevo negocio'
  const channelName = String(channel?.name ?? '').trim()
  const title = channelName ? `${chatName} - ${channelName}` : chatName

  const { data: deal, error: insertError } = await db
    .from('deals')
    .insert({
      account_id: args.accountId,
      user_id: pipeline.user_id ?? args.userId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      contact_id: args.contactId,
      conversation_id: args.conversationId,
      title,
      value: 0,
      currency: account?.default_currency ?? 'USD',
      status: 'open',
    })
    .select('id')
    .single()

  if (insertError || !deal) {
    throw new Error(insertError?.message ?? 'Could not create the channel deal')
  }

  return deal.id as string
}
