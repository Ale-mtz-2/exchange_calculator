UPDATE equivalentes_app.exchange_systems
SET is_active = false
WHERE id IN ('es_exchange', 'ar_exchange');

DO $$
DECLARE
  unsupported_active integer;
BEGIN
  SELECT COUNT(*) INTO unsupported_active
  FROM equivalentes_app.exchange_systems
  WHERE is_active = true
    AND id NOT IN ('mx_smae', 'us_usda');

  IF unsupported_active > 0 THEN
    RAISE EXCEPTION 'Unsupported active systems remain in equivalentes_app.exchange_systems';
  END IF;
END
$$;

ALTER TABLE equivalentes_app.food_exchange_overrides
  DROP CONSTRAINT IF EXISTS fk_food_exchange_overrides_exchange_subgroup,
  DROP CONSTRAINT IF EXISTS food_exchange_overrides_exchange_subgroup_id_fkey,
  DROP CONSTRAINT IF EXISTS food_exchange_overrides_exchange_group_id_fkey;

DROP INDEX IF EXISTS equivalentes_app.idx_food_exchange_overrides_system_subgroup;
DROP INDEX IF EXISTS equivalentes_app.idx_food_exchange_overrides_system_subgroup_id_v2;
DROP INDEX IF EXISTS equivalentes_app.idx_food_exchange_overrides_system_group_id;

ALTER TABLE equivalentes_app.food_exchange_overrides
  DROP COLUMN IF EXISTS exchange_subgroup_id,
  DROP COLUMN IF EXISTS exchange_group_id;

ALTER TABLE equivalentes_app.subgroup_selection_policies
  DROP CONSTRAINT IF EXISTS uq_subgroup_selection_policy,
  DROP CONSTRAINT IF EXISTS ck_subgroup_selection_policy_share;

DROP INDEX IF EXISTS equivalentes_app.uq_subgroup_selection_policy_subgroup_id;
DROP INDEX IF EXISTS equivalentes_app.idx_subgroup_selection_policies_system_subgroup_id;

ALTER TABLE equivalentes_app.subgroup_selection_policies
  DROP COLUMN IF EXISTS subgroup_code;

ALTER TABLE equivalentes_app.subgroup_selection_policies
  ADD CONSTRAINT ck_subgroup_selection_policy_active_subgroup
    CHECK (NOT is_active OR subgroup_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subgroup_selection_policy_subgroup_id
  ON equivalentes_app.subgroup_selection_policies (system_id, goal, diet_pattern, subgroup_id)
  WHERE subgroup_id IS NOT NULL;

ALTER TABLE equivalentes_app.subgroup_classification_rules
  DROP CONSTRAINT IF EXISTS uq_subgroup_classification_rule;

DROP INDEX IF EXISTS equivalentes_app.idx_subgroup_classification_rule_lookup;
DROP INDEX IF EXISTS equivalentes_app.idx_subgroup_classification_rules_system_parent_group_id;

ALTER TABLE equivalentes_app.subgroup_classification_rules
  DROP COLUMN IF EXISTS subgroup_code,
  DROP COLUMN IF EXISTS parent_group_code;

ALTER TABLE equivalentes_app.subgroup_classification_rules
  ADD CONSTRAINT ck_subgroup_classification_rule_active_ids
    CHECK (
      NOT is_active
      OR (
        parent_group_id IS NOT NULL
        AND subgroup_id IS NOT NULL
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_subgroup_classification_rule_by_ids
  ON equivalentes_app.subgroup_classification_rules (system_id, parent_group_id, subgroup_id, priority)
  WHERE parent_group_id IS NOT NULL AND subgroup_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subgroup_classification_rule_by_parent_id
  ON equivalentes_app.subgroup_classification_rules (system_id, parent_group_id, priority)
  WHERE parent_group_id IS NOT NULL;

DROP TABLE IF EXISTS equivalentes_app.exchange_subgroups;
DROP TABLE IF EXISTS equivalentes_app.exchange_groups;
