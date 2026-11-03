-- ============================================================
-- 087_automation_step_positions.sql
--
-- Persist drag positions for the automation canvas. NULL means the
-- step has never been positioned by a human and should be auto-laid
-- out by the UI.
-- ============================================================

ALTER TABLE automation_steps
  ADD COLUMN IF NOT EXISTS position_x double precision;

ALTER TABLE automation_steps
  ADD COLUMN IF NOT EXISTS position_y double precision;
