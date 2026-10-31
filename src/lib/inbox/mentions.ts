import type { AccountMember } from '@/types'

export interface MentionQuery {
  start: number
  query: string
}

function label(member: AccountMember): string {
  return (member.full_name || member.email || '').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The in-progress @query immediately before the caret, if any. */
export function mentionQueryAt(value: string, cursor: number): MentionQuery | null {
  const before = value.slice(0, cursor)
  const match = /(^|\s)@([^\s@]*)$/.exec(before)
  if (!match) return null
  const query = match[2]
  return { start: cursor - query.length - 1, query }
}

/** Replace an in-progress @query with a complete @Name token. */
export function insertMention(
  value: string,
  query: MentionQuery,
  member: AccountMember,
): { value: string; cursor: number } {
  const name = label(member)
  if (!name) return { value, cursor: query.start }
  const token = `@${name} `
  const next =
    value.slice(0, query.start) +
    token +
    value.slice(query.start + query.query.length + 1)
  return { value: next, cursor: query.start + token.length }
}

/** Members whose display name is mentioned in the note text. */
export function extractMentionedUserIds(
  value: string,
  members: AccountMember[],
): string[] {
  const ids = new Set<string>()
  for (const member of members) {
    const name = label(member)
    if (!name) continue
    const pattern = new RegExp(
      `(^|\\s)@${escapeRegExp(name)}(?=$|[\\s.,!?;:])`,
      'i',
    )
    if (pattern.test(value)) ids.add(member.user_id)
  }
  return [...ids]
}
