CREATE TABLE IF NOT EXISTS equivalentes_app.exchange_subgroups (
  id bigserial PRIMARY KEY,
  system_id text NOT NULL REFERENCES equivalentes_app.exchange_systems(id) ON DELETE CASCADE,
  parent_group_id bigint NOT NULL REFERENCES equivalentes_app.exchange_groups(id) ON DELETE CASCADE,
  subgroup_code text NOT NULL,
  display_name_es text NOT NULL,
  cho_g numeric(10,2) NOT NULL DEFAULT 0,
  pro_g numeric(10,2) NOT NULL DEFAULT 0,
  fat_g numeric(10,2) NOT NULL DEFAULT 0,
  kcal_target integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_exchange_subgroups_system_subgroup UNIQUE (system_id, subgroup_code)
);

CREATE INDEX IF NOT EXISTS idx_exchange_subgroups_system_parent
  ON equivalentes_app.exchange_subgroups (system_id, parent_group_id);

ALTER TABLE equivalentes_app.food_exchange_overrides
  ADD COLUMN IF NOT EXISTS exchange_subgroup_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_food_exchange_overrides_exchange_subgroup'
      AND conrelid = 'equivalentes_app.food_exchange_overrides'::regclass
  ) THEN
    ALTER TABLE equivalentes_app.food_exchange_overrides
      ADD CONSTRAINT fk_food_exchange_overrides_exchange_subgroup
      FOREIGN KEY (exchange_subgroup_id)
      REFERENCES equivalentes_app.exchange_subgroups(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_food_exchange_overrides_system_subgroup
  ON equivalentes_app.food_exchange_overrides (system_id, exchange_subgroup_id);

CREATE TABLE IF NOT EXISTS equivalentes_app.subgroup_selection_policies (
  id bigserial PRIMARY KEY,
  system_id text NOT NULL REFERENCES equivalentes_app.exchange_systems(id) ON DELETE CASCADE,
  goal text NOT NULL,
  diet_pattern text NOT NULL,
  subgroup_code text NOT NULL,
  target_share_pct numeric(5,2) NOT NULL,
  score_adjustment numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_subgroup_selection_policy UNIQUE (system_id, goal, diet_pattern, subgroup_code),
  CONSTRAINT ck_subgroup_selection_policy_share CHECK (target_share_pct >= 0 AND target_share_pct <= 100)
);

CREATE INDEX IF NOT EXISTS idx_subgroup_selection_policy_lookup
  ON equivalentes_app.subgroup_selection_policies (system_id, goal, diet_pattern);

CREATE TABLE IF NOT EXISTS equivalentes_app.subgroup_classification_rules (
  id bigserial PRIMARY KEY,
  system_id text NOT NULL REFERENCES equivalentes_app.exchange_systems(id) ON DELETE CASCADE,
  parent_group_code text NOT NULL,
  subgroup_code text NOT NULL,
  min_fat_per_7g_pro numeric(10,4) NOT NULL,
  max_fat_per_7g_pro numeric(10,4),
  priority integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_subgroup_classification_rule UNIQUE (system_id, parent_group_code, subgroup_code, priority)
);

CREATE INDEX IF NOT EXISTS idx_subgroup_classification_rule_lookup
  ON equivalentes_app.subgroup_classification_rules (system_id, parent_group_code, priority);
