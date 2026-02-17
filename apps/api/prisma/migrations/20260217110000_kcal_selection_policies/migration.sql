CREATE TABLE IF NOT EXISTS equivalentes_app.kcal_selection_policies (
  id bigserial PRIMARY KEY,
  system_id text NOT NULL REFERENCES equivalentes_app.exchange_systems(id) ON DELETE CASCADE,
  low_target_kcal integer NOT NULL DEFAULT 1600,
  high_target_kcal integer NOT NULL DEFAULT 3000,
  min_tolerance_pct numeric(5,2) NOT NULL DEFAULT 0.20,
  max_tolerance_pct numeric(5,2) NOT NULL DEFAULT 0.60,
  min_tolerance_kcal integer NOT NULL DEFAULT 25,
  soft_penalty_per_10pct numeric(6,2) NOT NULL DEFAULT 2.50,
  hard_outlier_multiplier numeric(6,2) NOT NULL DEFAULT 2.80,
  exclude_hard_outliers boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_kcal_selection_policy_system UNIQUE (system_id),
  CONSTRAINT ck_kcal_selection_policy_target_range CHECK (high_target_kcal > low_target_kcal),
  CONSTRAINT ck_kcal_selection_policy_tolerance_pct CHECK (
    min_tolerance_pct >= 0
    AND max_tolerance_pct >= min_tolerance_pct
  ),
  CONSTRAINT ck_kcal_selection_policy_positive CHECK (
    min_tolerance_kcal >= 0
    AND soft_penalty_per_10pct >= 0
    AND hard_outlier_multiplier > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_kcal_selection_policy_system_active
  ON equivalentes_app.kcal_selection_policies (system_id, is_active);
