import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  state: {
    pipeline: null as Record<string, unknown> | null,
    stage: null as Record<string, unknown> | null,
    existing: null as Record<string, unknown> | null,
    account: { default_currency: 'COP' } as Record<string, unknown> | null,
    channel: { name: 'Número de prueba' } as Record<string, unknown> | null,
    inserted: null as Record<string, unknown> | null,
    fromCalls: [] as string[],
  },
}))

vi.mock('@/lib/flows/admin-client', () => {
  const { state } = h

  function builder(table: string) {
    const ops = {
      filters: [] as [string, unknown][],
      payload: null as Record<string, unknown> | null,
      type: 'select' as 'select' | 'insert',
    }

    const resolve = () => {
      if (table === 'pipelines') return state.pipeline
      if (table === 'pipeline_stages') return state.stage
      if (table === 'channels') return state.channel
      if (table === 'accounts') return state.account
      if (table === 'deals') {
        if (ops.type === 'insert') {
          state.inserted = ops.payload
          return { id: 'deal-1' }
        }
        return state.existing
      }
      return null
    }

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (key: string, value: unknown) => {
        ops.filters.push([key, value])
        return chain
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: resolve(), error: null }),
      single: () => Promise.resolve({ data: resolve(), error: null }),
      insert: (payload: Record<string, unknown>) => {
        ops.type = 'insert'
        ops.payload = payload
        return chain
      },
    }
    return chain
  }

  return {
    supabaseAdmin: () => ({
      from: (table: string) => {
        state.fromCalls.push(table)
        return builder(table)
      },
    }),
  }
})

import { ensureChannelDeal } from './auto-deal'

const ARGS = {
  accountId: 'acct-1',
  userId: 'user-1',
  contactId: 'contact-1',
  conversationId: 'conv-1',
  channelId: 'channel-1',
  contactName: 'Ana',
  contactPhone: '+573001112233',
}

beforeEach(() => {
  h.state.pipeline = { id: 'pipeline-1', user_id: 'pipeline-owner' }
  h.state.stage = { id: 'stage-1' }
  h.state.existing = null
  h.state.account = { default_currency: 'COP' }
  h.state.channel = { name: 'Número de prueba' }
  h.state.inserted = null
  h.state.fromCalls = []
})

describe('ensureChannelDeal', () => {
  it('does nothing when the channel is missing', async () => {
    expect(await ensureChannelDeal({ ...ARGS, channelId: null })).toBeNull()
    expect(h.state.fromCalls).toEqual([])
  })

  it('does nothing when the channel has no pipeline', async () => {
    h.state.pipeline = null
    expect(await ensureChannelDeal(ARGS)).toBeNull()
    expect(h.state.inserted).toBeNull()
  })

  it('does nothing when the pipeline has no stages', async () => {
    h.state.stage = null
    expect(await ensureChannelDeal(ARGS)).toBeNull()
    expect(h.state.inserted).toBeNull()
  })

  it('creates one open deal linked to contact, conversation and first stage', async () => {
    expect(await ensureChannelDeal(ARGS)).toBe('deal-1')
    expect(h.state.inserted).toMatchObject({
      account_id: 'acct-1',
      user_id: 'pipeline-owner',
      pipeline_id: 'pipeline-1',
      stage_id: 'stage-1',
      contact_id: 'contact-1',
      conversation_id: 'conv-1',
      title: 'Ana - Número de prueba',
      value: 0,
      currency: 'COP',
      status: 'open',
    })
  })

  it('reuses the existing deal for the same conversation and pipeline', async () => {
    h.state.existing = { id: 'deal-existing' }
    expect(await ensureChannelDeal(ARGS)).toBe('deal-existing')
    expect(h.state.inserted).toBeNull()
  })
})
