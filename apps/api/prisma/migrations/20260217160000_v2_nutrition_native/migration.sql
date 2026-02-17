CREATE TABLE IF NOT EXISTS equivalentes_app.exchange_source_priorities (
  id bigserial PRIMARY KEY,
  system_id text NOT NULL,
  data_source_id integer NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_exchange_source_priorities_system_source UNIQUE (system_id, data_source_id),
  CONSTRAINT fk_exchange_source_priorities_data_source
    FOREIGN KEY (data_source_id)
    REFERENCES nutrition.data_sources(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exchange_source_priorities_lookup
  ON equivalentes_app.exchange_source_priorities (system_id, is_active, priority);

ALTER TABLE equivalentes_app.food_exchange_overrides
  ADD COLUMN IF NOT EXISTS group_id integer,
  ADD COLUMN IF NOT EXISTS subgroup_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_food_exchange_overrides_group_id'
      AND conrelid = 'equivalentes_app.food_exchange_overrides'::regclass
  ) THEN
    ALTER TABLE equivalentes_app.food_exchange_overrides
      ADD CONSTRAINT fk_food_exchange_overrides_group_id
      FOREIGN KEY (group_id)
      REFERENCES nutrition.exchange_groups(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_food_exchange_overrides_subgroup_id'
      AND conrelid = 'equivalentes_app.food_exchange_overrides'::regclass
  ) THEN
    ALTER TABLE equivalentes_app.food_exchange_overrides
      ADD CONSTRAINT fk_food_exchange_overrides_subgroup_id
      FOREIGN KEY (subgroup_id)
      REFERENCES nutrition.exchange_subgroups(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_food_exchange_overrides_system_group_id
  ON equivalentes_app.food_exchange_overrides (system_id, group_id);

CREATE INDEX IF NOT EXISTS idx_food_exchange_overrides_system_subgroup_id_v2
  ON equivalentes_app.food_exchange_overrides (system_id, subgroup_id);

ALTER TABLE equivalentes_app.subgroup_selection_policies
  ADD COLUMN IF NOT EXISTS subgroup_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_subgroup_selection_policies_subgroup_id'
      AND conrelid = 'equivalentes_app.subgroup_selection_policies'::regclass
  ) THEN
    ALTER TABLE equivalentes_app.subgroup_selection_policies
      ADD CONSTRAINT fk_subgroup_selection_policies_subgroup_id
      FOREIGN KEY (subgroup_id)
      REFERENCES nutrition.exchange_subgroups(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_subgroup_selection_policies_system_subgroup_id
  ON equivalentes_app.subgroup_selection_policies (system_id, subgroup_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subgroup_selection_policy_subgroup_id
  ON equivalentes_app.subgroup_selection_policies (system_id, goal, diet_pattern, subgroup_id)
  WHERE subgroup_id IS NOT NULL;

ALTER TABLE equivalentes_app.subgroup_classification_rules
  ADD COLUMN IF NOT EXISTS parent_group_id integer,
  ADD COLUMN IF NOT EXISTS subgroup_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_subgroup_classification_rules_parent_group_id'
      AND conrelid = 'equivalentes_app.subgroup_classification_rules'::regclass
  ) THEN
    ALTER TABLE equivalentes_app.subgroup_classification_rules
      ADD CONSTRAINT fk_subgroup_classification_rules_parent_group_id
      FOREIGN KEY (parent_group_id)
      REFERENCES nutrition.exchange_groups(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_subgroup_classification_rules_subgroup_id'
      AND conrelid = 'equivalentes_app.subgroup_classification_rules'::regclass
  ) THEN
    ALTER TABLE equivalentes_app.subgroup_classification_rules
      ADD CONSTRAINT fk_subgroup_classification_rules_subgroup_id
      FOREIGN KEY (subgroup_id)
      REFERENCES nutrition.exchange_subgroups(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_subgroup_classification_rules_system_parent_group_id
  ON equivalentes_app.subgroup_classification_rules (system_id, parent_group_id, priority)
  WHERE parent_group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS equivalentes_app.exchange_bucket_profiles (
  id bigserial PRIMARY KEY,
  profile_version text NOT NULL,
  system_id text NOT NULL,
  bucket_type text NOT NULL,
  bucket_id integer NOT NULL,
  parent_group_id integer,
  cho_g numeric(10,2) NOT NULL,
  pro_g numeric(10,2) NOT NULL,
  fat_g numeric(10,2) NOT NULL,
  kcal integer NOT NULL,
  sample_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_exchange_bucket_profiles_bucket_type
    CHECK (bucket_type IN ('group', 'subgroup')),
  CONSTRAINT ck_exchange_bucket_profiles_parent_group
    CHECK (
      (bucket_type = 'group' AND parent_group_id IS NULL)
      OR
      (bucket_type = 'subgroup' AND parent_group_id IS NOT NULL)
    ),
  CONSTRAINT fk_exchange_bucket_profiles_parent_group
    FOREIGN KEY (parent_group_id)
    REFERENCES nutrition.exchange_groups(id)
    ON DELETE CASCADE,
  CONSTRAINT uq_exchange_bucket_profiles_version_system_bucket
    UNIQUE (profile_version, system_id, bucket_type, bucket_id)
);

CREATE INDEX IF NOT EXISTS idx_exchange_bucket_profiles_lookup
  ON equivalentes_app.exchange_bucket_profiles (system_id, profile_version, bucket_type, bucket_id);
