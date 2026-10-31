-- ============================================================
-- 063_org_canvas_positions.sql
--
-- Persist the visual position of each department on the company
-- structure canvas. All-zero positions mean "not laid out yet" and the
-- canvas runs dagre once to produce a readable starting tree.
-- ============================================================

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS position_x integer NOT NULL DEFAULT 0;

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS position_y integer NOT NULL DEFAULT 0;
