CREATE TABLE IF NOT EXISTS equivalentes_app.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text,
  name text NOT NULL,
  email text,
  whatsapp text,
  birth_date date,
  waist_cm numeric(6, 2),
  has_diabetes boolean NOT NULL DEFAULT false,
  has_hypertension boolean NOT NULL DEFAULT false,
  has_dyslipidemia boolean NOT NULL DEFAULT false,
  training_window text NOT NULL DEFAULT 'none',
  uses_dairy_in_snacks boolean NOT NULL DEFAULT true,
  terms_accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE equivalentes_app.leads
  ADD COLUMN IF NOT EXISTS cid text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS waist_cm numeric(6, 2),
  ADD COLUMN IF NOT EXISTS has_diabetes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_hypertension boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_dyslipidemia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_window text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS uses_dairy_in_snacks boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS terms_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE equivalentes_app.leads
SET
  has_diabetes = COALESCE(has_diabetes, false),
  has_hypertension = COALESCE(has_hypertension, false),
  has_dyslipidemia = COALESCE(has_dyslipidemia, false),
  training_window = COALESCE(NULLIF(training_window, ''), 'none'),
  uses_dairy_in_snacks = COALESCE(uses_dairy_in_snacks, true),
  terms_accepted = COALESCE(terms_accepted, false),
  updated_at = COALESCE(updated_at, now())
WHERE
  has_diabetes IS NULL
  OR has_hypertension IS NULL
  OR has_dyslipidemia IS NULL
  OR training_window IS NULL
  OR uses_dairy_in_snacks IS NULL
  OR terms_accepted IS NULL
  OR updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_leads_training_window'
      AND conrelid = 'equivalentes_app.leads'::regclass
  ) THEN
    ALTER TABLE equivalentes_app.leads
      ADD CONSTRAINT ck_leads_training_window
      CHECK (training_window IN ('none', 'morning', 'afternoon', 'evening'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_cid
  ON equivalentes_app.leads (cid);

CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_cid_not_null
  ON equivalentes_app.leads (cid)
  WHERE cid IS NOT NULL;

CREATE OR REPLACE FUNCTION equivalentes_app.set_updated_at_leads()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at_leads ON equivalentes_app.leads;
CREATE TRIGGER trg_set_updated_at_leads
BEFORE UPDATE ON equivalentes_app.leads
FOR EACH ROW
EXECUTE FUNCTION equivalentes_app.set_updated_at_leads();
