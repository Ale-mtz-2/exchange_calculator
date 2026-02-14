CREATE SCHEMA IF NOT EXISTS equivalentes_app;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS equivalentes_app.tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  event_type text NOT NULL,
  meta jsonb,
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_cid_created_at
  ON equivalentes_app.tracking_events (cid, created_at);
CREATE INDEX IF NOT EXISTS idx_tracking_events_event_created_at
  ON equivalentes_app.tracking_events (event_type, created_at);

CREATE TABLE IF NOT EXISTS equivalentes_app.kcal_formulas (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equivalentes_app.exchange_systems (
  id text PRIMARY KEY,
  country_code char(2) NOT NULL,
  name text NOT NULL,
  source text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equivalentes_app.exchange_groups (
  id bigserial PRIMARY KEY,
  system_id text NOT NULL REFERENCES equivalentes_app.exchange_systems(id) ON DELETE CASCADE,
  group_code text NOT NULL,
  display_name_es text NOT NULL,
  cho_g numeric(10,2) NOT NULL DEFAULT 0,
  pro_g numeric(10,2) NOT NULL DEFAULT 0,
  fat_g numeric(10,2) NOT NULL DEFAULT 0,
  kcal_target integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_exchange_groups_system_group UNIQUE (system_id, group_code)
);

CREATE TABLE IF NOT EXISTS equivalentes_app.country_states (
  country_code char(2) NOT NULL,
  state_code text NOT NULL,
  state_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country_code, state_code)
);

CREATE TABLE IF NOT EXISTS equivalentes_app.food_exchange_overrides (
  food_id integer NOT NULL,
  system_id text NOT NULL REFERENCES equivalentes_app.exchange_systems(id) ON DELETE CASCADE,
  exchange_group_id bigint REFERENCES equivalentes_app.exchange_groups(id) ON DELETE SET NULL,
  equivalent_portion_qty numeric(10,2),
  portion_unit text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (food_id, system_id),
  CONSTRAINT fk_food_exchange_overrides_food
    FOREIGN KEY (food_id)
    REFERENCES nutrition.foods(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS equivalentes_app.food_geo_weights (
  id bigserial PRIMARY KEY,
  food_id integer NOT NULL,
  country_code char(2) NOT NULL,
  state_code text,
  weight numeric(10,2) NOT NULL DEFAULT 0,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_food_geo_weights_food
    FOREIGN KEY (food_id)
    REFERENCES nutrition.foods(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_food_geo_weights_country_state_food
  ON equivalentes_app.food_geo_weights (country_code, state_code, food_id);

CREATE TABLE IF NOT EXISTS equivalentes_app.food_profile_tags (
  id bigserial PRIMARY KEY,
  food_id integer NOT NULL,
  tag_type text NOT NULL,
  tag_value text NOT NULL,
  weight numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_food_profile_tags_food
    FOREIGN KEY (food_id)
    REFERENCES nutrition.foods(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_food_profile_tags_food_type
  ON equivalentes_app.food_profile_tags (food_id, tag_type);

CREATE TABLE IF NOT EXISTS equivalentes_app.generated_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cid text NOT NULL,
  country_code char(2) NOT NULL,
  state_code text NOT NULL,
  system_id text NOT NULL REFERENCES equivalentes_app.exchange_systems(id) ON DELETE RESTRICT,
  formula_id text NOT NULL REFERENCES equivalentes_app.kcal_formulas(id) ON DELETE RESTRICT,
  inputs jsonb NOT NULL,
  targets jsonb NOT NULL,
  equivalents jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_plans_cid_created_at
  ON equivalentes_app.generated_plans (cid, created_at);

CREATE TABLE IF NOT EXISTS equivalentes_app.generated_plan_recommendations (
  id bigserial PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES equivalentes_app.generated_plans(id) ON DELETE CASCADE,
  food_id integer NOT NULL REFERENCES nutrition.foods(id) ON DELETE CASCADE,
  group_code text NOT NULL,
  rank_score numeric(10,2) NOT NULL,
  reasons jsonb NOT NULL,
  is_extended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_recommendations_plan_group
  ON equivalentes_app.generated_plan_recommendations (plan_id, group_code);