import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

type Params = { params: Promise<{ id: string }> }

/**
 * Members eligible to be assigned to this conversation: the channel
 * area's members plus parent-area members. Conversations without a
 * channel/area fall back to every account member.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id } = await params

    const { data: conversation, error } = await supabase
      .from('conversations')
      .select('id, channel_id')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    let eligibleUserIds: string[] | null = null
    if (conversation.channel_id) {
      const { data: channel } = await supabase
        .from('channels')
        .select('department_id')
        .eq('id', conversation.channel_id)
        .eq('account_id', accountId)
        .maybeSingle()

      if (channel?.department_id) {
        const { data: departments } = await supabase
          .from('departments')
          .select('id, parent_id')
          .eq('account_id', accountId)
        const byId = new Map(
          (departments ?? []).map((d) => [d.id as string, d.parent_id as string | null]),
        )
        const chain: string[] = []
        let cursor: string | null = channel.department_id as string
        while (cursor && !chain.includes(cursor)) {
          chain.push(cursor)
          cursor = byId.get(cursor) ?? null
        }
        if (chain.length > 0) {
          const { data: memberships } = await supabase
            .from('department_members')
            .select('user_id')
            .eq('account_id', accountId)
            .in('department_id', chain)
          eligibleUserIds = [
            ...new Set((memberships ?? []).map((m) => m.user_id as string)),
          ]
        }
      }
    }

    let query = supabase
      .from('profiles')
      .select('user_id, full_name, email, avatar_url, account_role')
      .eq('account_id', accountId)
      .order('full_name', { ascending: true })
    if (eligibleUserIds) query = query.in('user_id', eligibleUserIds)

    const { data: profiles, error: profileError } = await query
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      members: (profiles ?? []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name ?? '',
        email: p.email ?? null,
        avatar_url: p.avatar_url,
        role: p.account_role,
        joined_at: '',
      })),
      restricted: eligibleUserIds !== null,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
