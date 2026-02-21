ALTER TABLE equivalentes_app.leads
  ADD COLUMN IF NOT EXISTS planning_focus text NOT NULL DEFAULT 'clinical';

UPDATE equivalentes_app.leads
SET planning_focus = COALESCE(NULLIF(planning_focus, ''), 'clinical')
WHERE planning_focus IS NULL
   OR planning_focus = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_leads_planning_focus'
      AND conrelid = 'equivalentes_app.leads'::regclass
  ) THEN
    ALTER TABLE equivalentes_app.leads
      ADD CONSTRAINT ck_leads_planning_focus
      CHECK (planning_focus IN ('clinical', 'hybrid_sport'));
  END IF;
END $$;