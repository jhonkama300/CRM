-- ============================================================
-- 089_automation_edges.sql
--
-- Foundation for moving automations from an ordered step tree to a
-- free graph, matching the Flows canvas: each node can expose one or
-- more output ports and each port can point at another node.
--
-- source_step_id NULL represents the trigger/start node.
-- source_port is 'default' for a linear step, 'yes'/'no' for a
-- condition, or an option id for buttons/list rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_edges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id   uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  source_step_id  uuid REFERENCES automation_steps(id) ON DELETE CASCADE,
  source_port     text NOT NULL DEFAULT 'default',
  target_step_id  uuid NOT NULL REFERENCES automation_steps(id) ON DELETE CASCADE,
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_edges_automation
  ON automation_edges(automation_id, position);

CREATE INDEX IF NOT EXISTS idx_automation_edges_source
  ON automation_edges(source_step_id, source_port, position);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_edges_unique
  ON automation_edges(
    automation_id,
    COALESCE(source_step_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_port,
    target_step_id
  );

ALTER TABLE automation_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_edges_select ON automation_edges;
CREATE POLICY automation_edges_select ON automation_edges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_edges.automation_id
        AND is_account_member(a.account_id)
    )
  );

DROP POLICY IF EXISTS automation_edges_modify ON automation_edges;
CREATE POLICY automation_edges_modify ON automation_edges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_edges.automation_id
        AND is_account_member(a.account_id, 'agent')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_edges.automation_id
        AND is_account_member(a.account_id, 'agent')
    )
  );
