import { describe, expect, it } from 'vitest'
import type { AccountMember } from '@/types'
import {
  extractMentionedUserIds,
  insertMention,
  mentionQueryAt,
} from './mentions'

function member(id: string, fullName: string, email: string | null = null): AccountMember {
  return {
    user_id: id,
    full_name: fullName,
    email,
    avatar_url: null,
    role: 'agent',
    joined_at: '2026-01-01T00:00:00Z',
  }
}

const ana = member('u-ana', 'Ana Torres')
const luis = member('u-luis', 'Luis (Ventas)')

describe('mentionQueryAt', () => {
  it('detects an @query at the start and after whitespace', () => {
    expect(mentionQueryAt('@an', 3)).toEqual({ start: 0, query: 'an' })
    expect(mentionQueryAt('hola @an', 8)).toEqual({ start: 5, query: 'an' })
  })

  it('ignores emails and completed mentions', () => {
    expect(mentionQueryAt('mail a@b', 8)).toBeNull()
    expect(mentionQueryAt('hola @Ana ', 10)).toBeNull()
  })
})

describe('insertMention', () => {
  it('replaces the partial token and leaves the cursor after it', () => {
    const result = insertMention('hola @an', { start: 5, query: 'an' }, ana)
    expect(result.value).toBe('hola @Ana Torres ')
    expect(result.cursor).toBe(result.value.length)
  })
})

describe('extractMentionedUserIds', () => {
  it('matches full names with spaces and punctuation', () => {
    expect(
      extractMentionedUserIds('@Ana Torres revisa esto, y @Luis (Ventas).', [
        ana,
        luis,
      ]),
    ).toEqual(['u-ana', 'u-luis'])
  })

  it('does not match a substring of another name', () => {
    expect(extractMentionedUserIds('@Ana', [ana])).toEqual([])
  })

  it('treats regex characters in names literally', () => {
    expect(extractMentionedUserIds('@Luis (Ventas)', [luis])).toEqual(['u-luis'])
  })
})
