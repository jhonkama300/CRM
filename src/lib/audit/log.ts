import { supabaseAdmin } from '@/lib/flows/admin-client'

export interface AuditEvent {
  accountId: string
  actorUserId: string | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Append an audit row. Best-effort: an audit write must never make the
 * business action fail after it already succeeded.
 */
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from('audit_logs').insert({
      account_id: event.accountId,
      actor_user_id: event.actorUserId,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      metadata: event.metadata ?? {},
    })
    if (error) {
      console.error('[audit] write failed:', error.message)
    }
  } catch (err) {
    console.error('[audit] write threw:', err)
  }
}
