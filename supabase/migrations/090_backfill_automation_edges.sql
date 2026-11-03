-- ============================================================
-- 090_backfill_automation_edges.sql
--
-- Convert existing ordered automation trees into graph edges so the
-- graph executor can run them without waiting for a manual rebuild.
-- Nested conditions are walked recursively; siblings after the first
-- child in a branch use the 'default' port.
-- ============================================================

DO $$
DECLARE
  v_automation uuid;
  v_condition uuid;
  v_target uuid;
  v_previous uuid;
  v_first boolean;
  v_branch text;
BEGIN
  FOR v_automation IN SELECT id FROM automations LOOP
    IF EXISTS (
      SELECT 1 FROM automation_edges WHERE automation_id = v_automation
    ) THEN
      CONTINUE;
    END IF;

    -- Root chain: trigger -> first root step, then step -> next step.
    v_previous := NULL;
    FOR v_target IN
      SELECT id
      FROM automation_steps
      WHERE automation_id = v_automation
        AND parent_step_id IS NULL
      ORDER BY position
    LOOP
      INSERT INTO automation_edges (
        automation_id, source_step_id, source_port, target_step_id, position
      ) VALUES (
        v_automation, v_previous, 'default', v_target,
        COALESCE((SELECT max(position) + 1 FROM automation_edges WHERE automation_id = v_automation), 0)
      );
      v_previous := v_target;
    END LOOP;

    -- Every condition owns two explicit output ports.
    FOR v_condition IN
      SELECT id
      FROM automation_steps
      WHERE automation_id = v_automation
        AND step_type = 'condition'
    LOOP
      FOREACH v_branch IN ARRAY ARRAY['yes', 'no'] LOOP
        v_previous := v_condition;
        v_first := true;
        FOR v_target IN
          SELECT id
          FROM automation_steps
          WHERE automation_id = v_automation
            AND parent_step_id = v_condition
            AND branch = v_branch
          ORDER BY position
        LOOP
          INSERT INTO automation_edges (
            automation_id, source_step_id, source_port, target_step_id, position
          ) VALUES (
            v_automation,
            v_previous,
            CASE WHEN v_first THEN v_branch ELSE 'default' END,
            v_target,
            COALESCE((SELECT max(position) + 1 FROM automation_edges WHERE automation_id = v_automation), 0)
          );
          v_previous := v_target;
          v_first := false;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;
