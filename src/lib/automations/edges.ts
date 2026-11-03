import { supabaseAdmin } from './admin-client'

export interface AutomationEdgeInput {
  source_step_id: string | null
  source_port: string
  target_step_id: string
  position?: number
}

export async function loadEdges(automationId: string): Promise<AutomationEdgeInput[]> {
  const { data, error } = await supabaseAdmin()
    .from('automation_edges')
    .select('source_step_id, source_port, target_step_id, position')
    .eq('automation_id', automationId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as AutomationEdgeInput[]
}

export async function replaceEdges(
  automationId: string,
  edges: AutomationEdgeInput[],
): Promise<string | null> {
  const admin = supabaseAdmin()
  const { error: deleteError } = await admin
    .from('automation_edges')
    .delete()
    .eq('automation_id', automationId)
  if (deleteError) return deleteError.message
  if (edges.length === 0) return null

  const stepRows = await admin
    .from('automation_steps')
    .select('id')
    .eq('automation_id', automationId)
  if (stepRows.error) return stepRows.error.message
  const validIds = new Set((stepRows.data ?? []).map((row) => row.id as string))
  for (const edge of edges) {
    if (edge.source_step_id && !validIds.has(edge.source_step_id)) {
      return 'Edge source does not belong to this automation'
    }
    if (!validIds.has(edge.target_step_id)) {
      return 'Edge target does not belong to this automation'
    }
    if (edge.source_step_id === edge.target_step_id) {
      return 'A node cannot connect to itself'
    }
  }
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const source = edge.source_step_id ?? '__trigger__'
    const list = adjacency.get(source) ?? []
    list.push(edge.target_step_id)
    adjacency.set(source, list)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  function hasCycle(node: string): boolean {
    if (visiting.has(node)) return true
    if (visited.has(node)) return false
    visiting.add(node)
    for (const next of adjacency.get(node) ?? []) {
      if (hasCycle(next)) return true
    }
    visiting.delete(node)
    visited.add(node)
    return false
  }
  for (const node of adjacency.keys()) {
    if (hasCycle(node)) return 'Connections cannot contain a cycle'
  }

  const rows = edges.map((edge, index) => ({
    automation_id: automationId,
    source_step_id: edge.source_step_id,
    source_port: edge.source_port || 'default',
    target_step_id: edge.target_step_id,
    position: edge.position ?? index,
  }))
  const { error } = await admin.from('automation_edges').insert(rows)
  return error?.message ?? null
}
