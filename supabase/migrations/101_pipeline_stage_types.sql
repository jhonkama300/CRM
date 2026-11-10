-- ============================================================
-- 101_pipeline_stage_types.sql
--
-- Give every pipeline stage a role:
--   start    - entry point
--   progress - working stages
--   closing  - terminal stages, with a won/lost outcome
--
-- Existing pipelines are backfilled: first stage = start, last
-- stage = closing/won, and a Perdido closing/lost stage is added
-- when the pipeline does not already have one.
-- ============================================================

ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS stage_type TEXT NOT NULL DEFAULT 'progress',
  ADD COLUMN IF NOT EXISTS closing_outcome TEXT;

UPDATE public.pipeline_stages
SET stage_type = 'progress',
    closing_outcome = NULL;

ALTER TABLE public.pipeline_stages
  DROP CONSTRAINT IF EXISTS pipeline_stages_stage_type_check,
  ADD CONSTRAINT pipeline_stages_stage_type_check
    CHECK (stage_type IN ('start', 'progress', 'closing'));

ALTER TABLE public.pipeline_stages
  DROP CONSTRAINT IF EXISTS pipeline_stages_closing_outcome_check,
  ADD CONSTRAINT pipeline_stages_closing_outcome_check
    CHECK (
      (stage_type = 'closing' AND closing_outcome IN ('won', 'lost'))
      OR (stage_type <> 'closing' AND closing_outcome IS NULL)
    );

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY pipeline_id ORDER BY position ASC) AS rn
  FROM public.pipeline_stages
)
UPDATE public.pipeline_stages stage
SET stage_type = 'start',
    closing_outcome = NULL
FROM ranked
WHERE ranked.id = stage.id
  AND ranked.rn = 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY pipeline_id ORDER BY position DESC) AS rn
  FROM public.pipeline_stages
)
UPDATE public.pipeline_stages stage
SET stage_type = 'closing',
    closing_outcome = 'won'
FROM ranked
WHERE ranked.id = stage.id
  AND ranked.rn = 1;

DO $$
DECLARE
  pipeline_row RECORD;
BEGIN
  FOR pipeline_row IN SELECT id FROM public.pipelines LOOP
    UPDATE public.pipeline_stages
    SET stage_type = 'closing',
        closing_outcome = 'lost'
    WHERE pipeline_id = pipeline_row.id
      AND (
        closing_outcome = 'lost'
        OR lower(name) IN ('perdido', 'perdida', 'lost')
      );

    IF NOT EXISTS (
      SELECT 1
      FROM public.pipeline_stages
      WHERE pipeline_id = pipeline_row.id
        AND stage_type = 'closing'
        AND closing_outcome = 'lost'
    ) THEN
      INSERT INTO public.pipeline_stages (
        pipeline_id,
        name,
        color,
        position,
        stage_type,
        closing_outcome
      )
      SELECT
        pipeline_row.id,
        'Perdido',
        '#f43f5e',
        COALESCE(max(position), -1) + 1,
        'closing',
        'lost'
      FROM public.pipeline_stages
      WHERE pipeline_id = pipeline_row.id;
    END IF;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_one_start
  ON public.pipeline_stages(pipeline_id)
  WHERE stage_type = 'start';
