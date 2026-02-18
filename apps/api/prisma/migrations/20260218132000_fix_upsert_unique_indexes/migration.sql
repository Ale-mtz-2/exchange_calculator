DROP INDEX IF EXISTS equivalentes_app.uq_subgroup_selection_policy_subgroup_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subgroup_selection_policy_subgroup_id
  ON equivalentes_app.subgroup_selection_policies (system_id, goal, diet_pattern, subgroup_id);

DROP INDEX IF EXISTS equivalentes_app.uq_subgroup_classification_rule_by_ids;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subgroup_classification_rule_by_ids
  ON equivalentes_app.subgroup_classification_rules (system_id, parent_group_id, subgroup_id, priority);
