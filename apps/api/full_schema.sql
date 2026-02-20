-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "equivalentes_app";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "nutrition";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "nutrition"."calculation_method_enum" AS ENUM ('MIFFLIN_ST_JEOR', 'HARRIS_BENEDICT', 'KATCH_MCARDLE');

-- CreateEnum
CREATE TYPE "nutrition"."menu_draft_status_enum" AS ENUM ('pending', 'applied', 'expired');

-- CreateEnum
CREATE TYPE "appointment_draft_stage_enum" AS ENUM ('metrics', 'progress', 'targets', 'planning', 'closing', 'notes');

-- CreateEnum
CREATE TYPE "appointmentstatus" AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "difficulty_enum" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "exercise_type_enum" AS ENUM ('MULTIARTICULAR', 'MONOARTICULAR');

-- CreateEnum
CREATE TYPE "goal_adjustment_type_enum" AS ENUM ('percent', 'fixed_kcal');

-- CreateEnum
CREATE TYPE "injury_status_enum" AS ENUM ('active', 'recovering', 'resolved', 'chronic');

-- CreateEnum
CREATE TYPE "onboarding_status_enum" AS ENUM ('pending', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "professional_role_enum" AS ENUM ('NUTRITIONIST', 'TRAINER');

-- CreateEnum
CREATE TYPE "professional_role_enum_old" AS ENUM ('NUTRICIONIST', 'TRAINER');

-- CreateEnum
CREATE TYPE "service_type_enum" AS ENUM ('NUTRITION', 'TRAINING', 'BOTH');

-- CreateEnum
CREATE TYPE "user_genre_enum" AS ENUM ('man', 'female');

-- CreateEnum
CREATE TYPE "user_role_enum" AS ENUM ('CLIENT', 'PROFESSIONAL', 'ADMIN', 'INFLUENCER');

-- CreateTable
CREATE TABLE "equivalentes_app"."tracking_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cid" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "meta" JSONB,
    "user_agent" TEXT,
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cid" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "whatsapp" TEXT,
    "birth_date" DATE,
    "waist_cm" DECIMAL(6,2),
    "has_diabetes" BOOLEAN NOT NULL DEFAULT false,
    "has_hypertension" BOOLEAN NOT NULL DEFAULT false,
    "has_dyslipidemia" BOOLEAN NOT NULL DEFAULT false,
    "training_window" TEXT NOT NULL DEFAULT 'none',
    "uses_dairy_in_snacks" BOOLEAN NOT NULL DEFAULT true,
    "terms_accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_leads_training_window" CHECK ("training_window" IN ('none', 'morning', 'afternoon', 'evening'))
);

-- CreateTable
CREATE TABLE "equivalentes_app"."kcal_formulas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kcal_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."exchange_systems" (
    "id" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."country_states" (
    "country_code" CHAR(2) NOT NULL,
    "state_code" TEXT NOT NULL,
    "state_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_states_pkey" PRIMARY KEY ("country_code","state_code")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."food_geo_weights" (
    "id" BIGSERIAL NOT NULL,
    "food_id" INTEGER NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "state_code" TEXT,
    "weight" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "source" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_geo_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."food_profile_tags" (
    "id" BIGSERIAL NOT NULL,
    "food_id" INTEGER NOT NULL,
    "tag_type" TEXT NOT NULL,
    "tag_value" TEXT NOT NULL,
    "weight" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_profile_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."subgroup_selection_policies" (
    "id" BIGSERIAL NOT NULL,
    "system_id" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "diet_pattern" TEXT NOT NULL,
    "target_share_pct" DECIMAL(5,2) NOT NULL,
    "score_adjustment" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subgroup_id" INTEGER,

    CONSTRAINT "subgroup_selection_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."kcal_selection_policies" (
    "id" BIGSERIAL NOT NULL,
    "system_id" TEXT NOT NULL,
    "low_target_kcal" INTEGER NOT NULL DEFAULT 1600,
    "high_target_kcal" INTEGER NOT NULL DEFAULT 3000,
    "min_tolerance_pct" DECIMAL(5,2) NOT NULL DEFAULT 0.20,
    "max_tolerance_pct" DECIMAL(5,2) NOT NULL DEFAULT 0.60,
    "min_tolerance_kcal" INTEGER NOT NULL DEFAULT 25,
    "soft_penalty_per_10pct" DECIMAL(6,2) NOT NULL DEFAULT 2.50,
    "hard_outlier_multiplier" DECIMAL(6,2) NOT NULL DEFAULT 2.80,
    "exclude_hard_outliers" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kcal_selection_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."subgroup_classification_rules" (
    "id" BIGSERIAL NOT NULL,
    "system_id" TEXT NOT NULL,
    "min_fat_per_7g_pro" DECIMAL(10,4) NOT NULL,
    "max_fat_per_7g_pro" DECIMAL(10,4),
    "priority" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parent_group_id" INTEGER,
    "subgroup_id" INTEGER,

    CONSTRAINT "subgroup_classification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."exchange_source_priorities" (
    "id" BIGSERIAL NOT NULL,
    "system_id" TEXT NOT NULL,
    "data_source_id" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_source_priorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."exchange_bucket_profiles" (
    "id" BIGSERIAL NOT NULL,
    "profile_version" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "bucket_type" TEXT NOT NULL,
    "bucket_id" INTEGER NOT NULL,
    "parent_group_id" INTEGER,
    "cho_g" DECIMAL(10,2) NOT NULL,
    "pro_g" DECIMAL(10,2) NOT NULL,
    "fat_g" DECIMAL(10,2) NOT NULL,
    "kcal" INTEGER NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_bucket_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."generated_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cid" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "state_code" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "formula_id" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "targets" JSONB NOT NULL,
    "equivalents" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."generated_plan_recommendations" (
    "id" BIGSERIAL NOT NULL,
    "plan_id" UUID NOT NULL,
    "food_id" INTEGER NOT NULL,
    "group_code" TEXT NOT NULL,
    "rank_score" DECIMAL(10,2) NOT NULL,
    "reasons" JSONB NOT NULL,
    "is_extended" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_plan_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218193843_smae_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218193843_smae_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218193843_smae_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218194945_smae_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218194945_smae_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218194945_smae_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218195833_smae_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218195833_smae_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218195833_smae_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203039_smae_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203039_smae_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203039_smae_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203219_smae_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203219_smae_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203219_smae_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203515_smae_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203515_smae_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203515_smae_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203838_smae_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203838_smae_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218203838_smae_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218211811_smae_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218211811_smae_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218211811_smae_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218234500_mx_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218234500_mx_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260218234500_mx_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260219035756_smae_fnv_active" (
    "id" INTEGER,
    "food_id" INTEGER,
    "data_source_id" INTEGER,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2),
    "base_unit" VARCHAR(20),
    "state" VARCHAR(20),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1)
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260219035756_smae_foods" (
    "id" INTEGER,
    "name" VARCHAR(255),
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN,
    "base_serving_size" DECIMAL(10,2),
    "base_unit" VARCHAR(20),
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."backup_20260219035756_smae_overrides" (
    "food_id" INTEGER,
    "system_id" TEXT,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "group_id" INTEGER,
    "subgroup_id" INTEGER
);

-- CreateTable
CREATE TABLE "equivalentes_app"."food_exchange_overrides" (
    "food_id" INTEGER NOT NULL,
    "system_id" TEXT NOT NULL,
    "equivalent_portion_qty" DECIMAL(10,2),
    "portion_unit" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "group_id" INTEGER,
    "subgroup_id" INTEGER,

    CONSTRAINT "food_exchange_overrides_pkey" PRIMARY KEY ("food_id","system_id")
);

-- CreateTable
CREATE TABLE "nutrition"."client_menu_calendar" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "menu_id" INTEGER NOT NULL,
    "assigned_date" DATE,
    "assignment_start_date" DATE NOT NULL,
    "assignment_end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "menu_id_selected_client" INTEGER,
    "professional_id" INTEGER,

    CONSTRAINT "client_menu_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."client_records" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "medical_conditions" TEXT,
    "notes" TEXT,
    "preferences" JSONB,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."daily_targets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "start_date" DATE DEFAULT CURRENT_DATE,
    "end_date" DATE,
    "target_calories" INTEGER,
    "target_protein_g" INTEGER,
    "target_carbs_g" INTEGER,
    "target_fat_g" INTEGER,
    "is_active" BOOLEAN DEFAULT true,
    "meals" INTEGER,
    "calculation_method" "nutrition"."calculation_method_enum",
    "appointment_id" INTEGER,

    CONSTRAINT "daily_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."data_sources" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."exchange_groups" (
    "id" SERIAL NOT NULL,
    "system_id" INTEGER,
    "name" VARCHAR(100) NOT NULL,
    "avg_calories" INTEGER,
    "color_code" VARCHAR(7),

    CONSTRAINT "exchange_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."exchange_subgroups" (
    "id" SERIAL NOT NULL,
    "exchange_group_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_subgroups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."exchange_systems" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "country_code" VARCHAR(3),

    CONSTRAINT "exchange_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."food_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(50),

    CONSTRAINT "food_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."food_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER,
    "food_id" INTEGER,
    "date" DATE DEFAULT CURRENT_DATE,
    "meal_type" VARCHAR(20),
    "quantity" DECIMAL(10,2),
    "serving_unit_id" INTEGER,
    "logged_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."food_micronutrient_values" (
    "id" SERIAL NOT NULL,
    "food_nutrition_value_id" INTEGER NOT NULL,
    "micronutrient_id" INTEGER NOT NULL,
    "amount" DECIMAL(8,2),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_micronutrient_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."food_nutrition_values" (
    "id" SERIAL NOT NULL,
    "food_id" INTEGER NOT NULL,
    "data_source_id" INTEGER NOT NULL,
    "calories_kcal" DECIMAL(8,1),
    "protein_g" DECIMAL(8,1),
    "carbs_g" DECIMAL(8,1),
    "fat_g" DECIMAL(8,1),
    "base_serving_size" DECIMAL(6,2) DEFAULT 100,
    "base_unit" VARCHAR(20) DEFAULT 'g',
    "state" VARCHAR(20) DEFAULT 'standard',
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "fiber_g" DECIMAL(8,1),
    "glycemic_index" DECIMAL(8,1),
    "glycemic_load" DECIMAL(8,1),

    CONSTRAINT "food_nutrition_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."foods" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "brand" VARCHAR(100),
    "category_id" INTEGER,
    "exchange_group_id" INTEGER,
    "is_recipe" BOOLEAN DEFAULT false,
    "base_serving_size" DECIMAL(10,2) DEFAULT 100,
    "base_unit" VARCHAR(20) DEFAULT 'g',
    "calories_kcal" DECIMAL(10,2),
    "protein_g" DECIMAL(10,2),
    "carbs_g" DECIMAL(10,2),
    "fat_g" DECIMAL(10,2),
    "exchange_subgroup_id" INTEGER,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."meal_plan_exchanges" (
    "id" SERIAL NOT NULL,
    "meal_plan_meal_id" INTEGER,
    "exchange_group_id" INTEGER,
    "quantity" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "meal_plan_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."meal_plan_meals" (
    "id" SERIAL NOT NULL,
    "meal_plan_id" INTEGER NOT NULL,
    "meal_name" VARCHAR(50) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "meal_plan_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."meal_plans" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_by" INTEGER,
    "is_template" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."menu_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "professional_id" INTEGER NOT NULL,
    "client_id" INTEGER,
    "json_data" JSONB NOT NULL,
    "last_autosave" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "is_ai_generated" BOOLEAN DEFAULT true,
    "status" "nutrition"."menu_draft_status_enum" DEFAULT 'pending',
    "applied_at" TIMESTAMP(6),

    CONSTRAINT "menu_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."menu_items" (
    "id" SERIAL NOT NULL,
    "menu_meal_id" INTEGER,
    "exchange_group_id" INTEGER,
    "food_id" INTEGER,
    "serving_unit_id" INTEGER,
    "quantity" INTEGER DEFAULT 1,
    "recipe_id" INTEGER,
    "equivalent_quantity" DECIMAL(5,2),

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."menu_meals" (
    "id" SERIAL NOT NULL,
    "menu_id" INTEGER,
    "name" VARCHAR(50),
    "source_meal_plan_meal_id" INTEGER,

    CONSTRAINT "menu_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."menus" (
    "id" SERIAL NOT NULL,
    "meal_plan_id" INTEGER,
    "client_id" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "is_reusable" BOOLEAN,
    "description " VARCHAR(255),
    "title" VARCHAR(150),

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."micronutrients" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "category" VARCHAR(50),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "micronutrients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."professional_settings" (
    "professional_id" INTEGER NOT NULL,
    "preferred_exchange_system_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_settings_pkey" PRIMARY KEY ("professional_id")
);

-- CreateTable
CREATE TABLE "nutrition"."recipe_exchanges" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER,
    "exchange_group_id" INTEGER,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "recipe_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."recipe_foods" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER,
    "food_id" INTEGER,
    "serving_unit_id" INTEGER,
    "quantity" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "recipe_foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."recipes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_by" INTEGER,
    "is_template" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."serving_units" (
    "id" SERIAL NOT NULL,
    "food_id" INTEGER,
    "unit_name" VARCHAR(50) NOT NULL,
    "gram_equivalent" DECIMAL(10,2) NOT NULL,
    "is_exchange_unit" BOOLEAN DEFAULT false,

    CONSTRAINT "serving_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_codes" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "discount_percent" INTEGER DEFAULT 20,
    "commission_percent" INTEGER DEFAULT 25,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "affiliate_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergens" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allergens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_drafts" (
    "appointment_id" INTEGER NOT NULL,
    "stage" "appointment_draft_stage_enum",
    "json_state" JSONB,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "duration" INTEGER DEFAULT 0,

    CONSTRAINT "appointment_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" SERIAL NOT NULL,
    "professional_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(6) NOT NULL,
    "duration_minutes" INTEGER DEFAULT 60,
    "status" VARCHAR(20) DEFAULT 'scheduled',
    "title" VARCHAR(150),
    "meeting_link" TEXT,
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "start_date" TIMESTAMP(6),
    "end_date" TIMESTAMP(6),
    "effective_duration" INTEGER,
    "is_intake" BOOLEAN NOT NULL DEFAULT false,
    "type" "service_type_enum" DEFAULT 'NUTRITION',

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" SERIAL NOT NULL,
    "professional_id" INTEGER NOT NULL,
    "day_of_week" INTEGER,
    "start_time" TIME(6),
    "end_time" TIME(6),
    "is_active" BOOLEAN DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_allergens" (
    "client_id" INTEGER NOT NULL,
    "allergen_id" INTEGER NOT NULL,

    CONSTRAINT "client_allergens_pkey" PRIMARY KEY ("client_id","allergen_id")
);

-- CreateTable
CREATE TABLE "client_goals" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "goal_id" INTEGER NOT NULL,
    "is_primary" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_health_metrics" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "glucose_mg_dl" INTEGER,
    "glucose_context" VARCHAR(20),
    "systolic_mmhg" INTEGER,
    "diastolic_mmhg" INTEGER,
    "heart_rate_bpm" INTEGER,
    "oxygen_saturation_pct" DECIMAL(4,1),
    "notes" TEXT,

    CONSTRAINT "client_health_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_injuries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "body_part" VARCHAR(100) NOT NULL,
    "severity" INTEGER,
    "status" "injury_status_enum" DEFAULT 'active',
    "limitations" TEXT,
    "diagnosis_date" DATE,
    "recovery_date" DATE,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_injuries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_metrics" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE DEFAULT CURRENT_DATE,
    "logged_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "weight_kg" DECIMAL(5,2),
    "height_cm" DECIMAL(5,2),
    "body_fat_pct" DECIMAL(4,1),
    "muscle_mass_kg" DECIMAL(5,2),
    "visceral_fat" DECIMAL(4,1),
    "water_pct" DECIMAL(4,1),
    "waist_cm" DECIMAL(5,1),
    "hip_cm" DECIMAL(5,1),
    "chest_cm" DECIMAL(5,1),
    "arm_left_cm" DECIMAL(5,1),
    "arm_right_cm" DECIMAL(5,1),
    "thigh_left_cm" DECIMAL(5,1),
    "thigh_right_cm" DECIMAL(5,1),
    "calf_left_cm" DECIMAL(5,1),
    "calf_right_cm" DECIMAL(5,1),
    "notes" TEXT,
    "recorded_by_user_id" INTEGER,
    "appointment_id" INTEGER,

    CONSTRAINT "client_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "adjustment_type" "goal_adjustment_type_enum" DEFAULT 'percent',
    "adjustment_value" INTEGER DEFAULT 0,
    "carbs_ratio" DECIMAL(3,2),
    "fat_ratio" DECIMAL(3,2),
    "protein_ratio" DECIMAL(3,2),

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_profiles" (
    "user_id" INTEGER NOT NULL,
    "commission_percent" INTEGER DEFAULT 20,
    "discount_percent" INTEGER DEFAULT 20,
    "bank_info" JSONB,
    "tax_id" VARCHAR(20),
    "balance_due" DECIMAL(10,2) DEFAULT 0,
    "total_paid" DECIMAL(10,2) DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "influencer_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "intake_submissions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "form_version" VARCHAR(20),
    "raw_responses" JSONB NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price_monthly" DECIMAL(10,2),
    "access_nutrition" BOOLEAN DEFAULT false,
    "access_training" BOOLEAN DEFAULT false,
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_clients" (
    "id" SERIAL NOT NULL,
    "professional_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "service_type" "service_type_enum" NOT NULL,
    "start_date" DATE DEFAULT CURRENT_DATE,
    "end_date" DATE,
    "is_active" BOOLEAN DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',

    CONSTRAINT "professional_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_profiles" (
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(100),
    "biography" TEXT,
    "specialties" TEXT[],
    "license_number" VARCHAR(50),
    "work_address" TEXT,
    "social_media" JSONB,

    CONSTRAINT "professional_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "is_revoked" BOOLEAN DEFAULT false,
    "user_agent" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "status" VARCHAR(20) DEFAULT 'active',
    "start_date" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(6) NOT NULL,
    "auto_renew" BOOLEAN DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "affiliate_code_id" INTEGER,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activation_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" VARCHAR(50) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_professional_roles" (
    "user_id" INTEGER NOT NULL,
    "role" "professional_role_enum" NOT NULL,

    CONSTRAINT "user_professional_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150),
    "password" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN DEFAULT true,
    "role" "user_role_enum",
    "phone_number" VARCHAR(15),
    "profile_picture" VARCHAR(500),
    "deleted_at" TIMESTAMPTZ(6),
    "lastname" VARCHAR(200),
    "username" VARCHAR(40),
    "is_phone_verified" BOOLEAN DEFAULT false,
    "onboarding_status" "onboarding_status_enum" DEFAULT 'pending',
    "onboarding_completed_at" TIMESTAMPTZ(6),
    "genre" "user_genre_enum",
    "date_of_birth" DATE,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_tracking_events_cid_created_at" ON "equivalentes_app"."tracking_events"("cid", "created_at");

-- CreateIndex
CREATE INDEX "idx_tracking_events_event_created_at" ON "equivalentes_app"."tracking_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "idx_food_geo_weights_country_state_food" ON "equivalentes_app"."food_geo_weights"("country_code", "state_code", "food_id");

-- CreateIndex
CREATE INDEX "idx_food_profile_tags_food_type" ON "equivalentes_app"."food_profile_tags"("food_id", "tag_type");

-- CreateIndex
CREATE INDEX "idx_subgroup_selection_policy_lookup" ON "equivalentes_app"."subgroup_selection_policies"("system_id", "goal", "diet_pattern");

-- CreateIndex
CREATE UNIQUE INDEX "uq_subgroup_selection_policy_subgroup_id" ON "equivalentes_app"."subgroup_selection_policies"("system_id", "goal", "diet_pattern", "subgroup_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_kcal_selection_policy_system" ON "equivalentes_app"."kcal_selection_policies"("system_id");

-- CreateIndex
CREATE INDEX "idx_kcal_selection_policy_system_active" ON "equivalentes_app"."kcal_selection_policies"("system_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_subgroup_classification_rule_by_ids" ON "equivalentes_app"."subgroup_classification_rules"("system_id", "parent_group_id", "subgroup_id", "priority");

-- CreateIndex
CREATE INDEX "idx_exchange_source_priorities_lookup" ON "equivalentes_app"."exchange_source_priorities"("system_id", "is_active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "uq_exchange_source_priorities_system_source" ON "equivalentes_app"."exchange_source_priorities"("system_id", "data_source_id");

-- CreateIndex
CREATE INDEX "idx_exchange_bucket_profiles_lookup" ON "equivalentes_app"."exchange_bucket_profiles"("system_id", "profile_version", "bucket_type", "bucket_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_exchange_bucket_profiles_version_system_bucket" ON "equivalentes_app"."exchange_bucket_profiles"("profile_version", "system_id", "bucket_type", "bucket_id");

-- CreateIndex
CREATE INDEX "idx_generated_plans_cid_created_at" ON "equivalentes_app"."generated_plans"("cid", "created_at");

-- CreateIndex
CREATE INDEX "idx_plan_recommendations_plan_group" ON "equivalentes_app"."generated_plan_recommendations"("plan_id", "group_code");

-- CreateIndex
CREATE INDEX "idx_calendar_client_date" ON "nutrition"."client_menu_calendar"("client_id", "assigned_date");

-- CreateIndex
CREATE INDEX "idx_food_logs_user_date" ON "nutrition"."food_logs"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "food_micronutrient_values_food_nutrition_value_id_micronutr_key" ON "nutrition"."food_micronutrient_values"("food_nutrition_value_id", "micronutrient_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_nutrition_values_food_id_data_source_id_state_key" ON "nutrition"."food_nutrition_values"("food_id", "data_source_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "uq_foods_name_group_category" ON "nutrition"."foods"("name", "exchange_group_id", "category_id");

-- CreateIndex
CREATE INDEX "idx_leads_cid" ON "equivalentes_app"."leads"("cid");

-- CreateIndex
CREATE UNIQUE INDEX "uq_leads_cid_not_null" ON "equivalentes_app"."leads"("cid") WHERE "cid" IS NOT NULL;

-- CreateFunction
CREATE OR REPLACE FUNCTION "equivalentes_app"."set_updated_at_leads"()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger
CREATE TRIGGER "trg_set_updated_at_leads"
BEFORE UPDATE ON "equivalentes_app"."leads"
FOR EACH ROW
EXECUTE FUNCTION "equivalentes_app"."set_updated_at_leads"();

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_codes_code_key" ON "affiliate_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_codes_user_id_key" ON "affiliate_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_drafts_appointment_id_key" ON "appointment_drafts"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_goals_client_id_goal_id_key" ON "client_goals"("client_id", "goal_id");

-- CreateIndex
CREATE INDEX "idx_health_metrics_user_date" ON "client_health_metrics"("user_id", "recorded_at");

-- CreateIndex
CREATE INDEX "idx_metrics_user_date" ON "client_metrics"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "goals_code_key" ON "goals"("code");

-- CreateIndex
CREATE INDEX "idx_prof_clients_client" ON "professional_clients"("client_id");

-- CreateIndex
CREATE INDEX "idx_prof_clients_prof" ON "professional_clients"("professional_id");

-- CreateIndex
CREATE UNIQUE INDEX "professional_clients_professional_id_client_id_service_type_key" ON "professional_clients"("professional_id", "client_id", "service_type");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_token" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_activation_tokens_token_key" ON "user_activation_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "idx_unique_userid_role" ON "user_professional_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- AddForeignKey
ALTER TABLE "equivalentes_app"."food_geo_weights" ADD CONSTRAINT "fk_food_geo_weights_food" FOREIGN KEY ("food_id") REFERENCES "nutrition"."foods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."food_profile_tags" ADD CONSTRAINT "fk_food_profile_tags_food" FOREIGN KEY ("food_id") REFERENCES "nutrition"."foods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."subgroup_selection_policies" ADD CONSTRAINT "fk_subgroup_selection_policies_subgroup_id" FOREIGN KEY ("subgroup_id") REFERENCES "nutrition"."exchange_subgroups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."subgroup_selection_policies" ADD CONSTRAINT "subgroup_selection_policies_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "equivalentes_app"."exchange_systems"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."kcal_selection_policies" ADD CONSTRAINT "kcal_selection_policies_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "equivalentes_app"."exchange_systems"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."subgroup_classification_rules" ADD CONSTRAINT "fk_subgroup_classification_rules_parent_group_id" FOREIGN KEY ("parent_group_id") REFERENCES "nutrition"."exchange_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."subgroup_classification_rules" ADD CONSTRAINT "fk_subgroup_classification_rules_subgroup_id" FOREIGN KEY ("subgroup_id") REFERENCES "nutrition"."exchange_subgroups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."subgroup_classification_rules" ADD CONSTRAINT "subgroup_classification_rules_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "equivalentes_app"."exchange_systems"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."exchange_source_priorities" ADD CONSTRAINT "fk_exchange_source_priorities_data_source" FOREIGN KEY ("data_source_id") REFERENCES "nutrition"."data_sources"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."exchange_bucket_profiles" ADD CONSTRAINT "fk_exchange_bucket_profiles_parent_group" FOREIGN KEY ("parent_group_id") REFERENCES "nutrition"."exchange_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."generated_plans" ADD CONSTRAINT "generated_plans_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "equivalentes_app"."kcal_formulas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."generated_plans" ADD CONSTRAINT "generated_plans_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "equivalentes_app"."exchange_systems"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."generated_plan_recommendations" ADD CONSTRAINT "generated_plan_recommendations_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "nutrition"."foods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."generated_plan_recommendations" ADD CONSTRAINT "generated_plan_recommendations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "equivalentes_app"."generated_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."food_exchange_overrides" ADD CONSTRAINT "fk_food_exchange_overrides_food" FOREIGN KEY ("food_id") REFERENCES "nutrition"."foods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."food_exchange_overrides" ADD CONSTRAINT "fk_food_exchange_overrides_group_id" FOREIGN KEY ("group_id") REFERENCES "nutrition"."exchange_groups"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."food_exchange_overrides" ADD CONSTRAINT "fk_food_exchange_overrides_subgroup_id" FOREIGN KEY ("subgroup_id") REFERENCES "nutrition"."exchange_subgroups"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "equivalentes_app"."food_exchange_overrides" ADD CONSTRAINT "food_exchange_overrides_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "equivalentes_app"."exchange_systems"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."client_menu_calendar" ADD CONSTRAINT "fk_calendar_client" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."client_menu_calendar" ADD CONSTRAINT "fk_calendar_menu" FOREIGN KEY ("menu_id") REFERENCES "nutrition"."menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition"."client_menu_calendar" ADD CONSTRAINT "fk_calendar_menu_selected" FOREIGN KEY ("menu_id_selected_client") REFERENCES "nutrition"."menus"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."client_menu_calendar" ADD CONSTRAINT "fk_calendar_professional" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."client_records" ADD CONSTRAINT "client_records_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."daily_targets" ADD CONSTRAINT "daily_targets_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."exchange_groups" ADD CONSTRAINT "exchange_groups_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "nutrition"."exchange_systems"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."exchange_subgroups" ADD CONSTRAINT "fk_subgroup_group" FOREIGN KEY ("exchange_group_id") REFERENCES "nutrition"."exchange_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition"."food_logs" ADD CONSTRAINT "food_logs_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "nutrition"."foods"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."food_logs" ADD CONSTRAINT "food_logs_serving_unit_id_fkey" FOREIGN KEY ("serving_unit_id") REFERENCES "nutrition"."serving_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."food_micronutrient_values" ADD CONSTRAINT "fk_food_nutrition" FOREIGN KEY ("food_nutrition_value_id") REFERENCES "nutrition"."food_nutrition_values"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."food_micronutrient_values" ADD CONSTRAINT "fk_micronutrient" FOREIGN KEY ("micronutrient_id") REFERENCES "nutrition"."micronutrients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."food_nutrition_values" ADD CONSTRAINT "food_nutrition_values_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "nutrition"."data_sources"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."food_nutrition_values" ADD CONSTRAINT "food_nutrition_values_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "nutrition"."foods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."foods" ADD CONSTRAINT "fk_food_subgroup" FOREIGN KEY ("exchange_subgroup_id") REFERENCES "nutrition"."exchange_subgroups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition"."foods" ADD CONSTRAINT "foods_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "nutrition"."food_categories"("id") ON DELETE SET NULL ON UPDATE SET NULL;

-- AddForeignKey
ALTER TABLE "nutrition"."foods" ADD CONSTRAINT "foods_exchange_group_id_fkey" FOREIGN KEY ("exchange_group_id") REFERENCES "nutrition"."exchange_groups"("id") ON DELETE SET NULL ON UPDATE SET NULL;

-- AddForeignKey
ALTER TABLE "nutrition"."meal_plan_exchanges" ADD CONSTRAINT "meal_plan_exchanges_exchange_group_id_fkey" FOREIGN KEY ("exchange_group_id") REFERENCES "nutrition"."exchange_groups"("id") ON DELETE SET NULL ON UPDATE SET NULL;

-- AddForeignKey
ALTER TABLE "nutrition"."meal_plan_exchanges" ADD CONSTRAINT "meal_plan_exchanges_meal_plan_meal_id_fkey" FOREIGN KEY ("meal_plan_meal_id") REFERENCES "nutrition"."meal_plan_meals"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."meal_plan_meals" ADD CONSTRAINT "meal_plan_meals_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "nutrition"."meal_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."menu_drafts" ADD CONSTRAINT "fk_client" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."menu_drafts" ADD CONSTRAINT "fk_professional" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."menu_items" ADD CONSTRAINT "menu_items_exchange_group_id_fkey" FOREIGN KEY ("exchange_group_id") REFERENCES "nutrition"."exchange_groups"("id") ON DELETE SET NULL ON UPDATE SET NULL;

-- AddForeignKey
ALTER TABLE "nutrition"."menu_items" ADD CONSTRAINT "menu_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "nutrition"."foods"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."menu_items" ADD CONSTRAINT "menu_items_menu_meal_id_fkey" FOREIGN KEY ("menu_meal_id") REFERENCES "nutrition"."menu_meals"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."menu_items" ADD CONSTRAINT "menu_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "nutrition"."menu_meals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."menu_items" ADD CONSTRAINT "menu_items_serving_unit_id_fkey" FOREIGN KEY ("serving_unit_id") REFERENCES "nutrition"."serving_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."menu_meals" ADD CONSTRAINT "menu_meals_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "nutrition"."menus"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."menus" ADD CONSTRAINT "menus_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "nutrition"."meal_plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."menus" ADD CONSTRAINT "menus_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."professional_settings" ADD CONSTRAINT "professional_settings_preferred_exchange_system_id_fkey" FOREIGN KEY ("preferred_exchange_system_id") REFERENCES "nutrition"."exchange_systems"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."recipe_exchanges" ADD CONSTRAINT "recipe_exchanges_exchange_group_id_fkey" FOREIGN KEY ("exchange_group_id") REFERENCES "nutrition"."exchange_groups"("id") ON DELETE SET NULL ON UPDATE SET NULL;

-- AddForeignKey
ALTER TABLE "nutrition"."recipe_exchanges" ADD CONSTRAINT "recipe_exchanges_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "nutrition"."recipes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."recipe_foods" ADD CONSTRAINT "recipe_foods_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "nutrition"."foods"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."recipe_foods" ADD CONSTRAINT "recipe_foods_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "nutrition"."recipes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."recipe_foods" ADD CONSTRAINT "recipe_foods_serving_unit_id_fkey" FOREIGN KEY ("serving_unit_id") REFERENCES "nutrition"."serving_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nutrition"."serving_units" ADD CONSTRAINT "serving_units_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "nutrition"."foods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "affiliate_codes" ADD CONSTRAINT "affiliate_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "appointment_drafts" ADD CONSTRAINT "appointment_drafts_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_allergens" ADD CONSTRAINT "client_allergens_allergen_id_fkey" FOREIGN KEY ("allergen_id") REFERENCES "allergens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_allergens" ADD CONSTRAINT "client_allergens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_goals" ADD CONSTRAINT "client_goals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_goals" ADD CONSTRAINT "client_goals_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_health_metrics" ADD CONSTRAINT "fk_user_health_metrics" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_injuries" ADD CONSTRAINT "fk_user_injuries" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_metrics" ADD CONSTRAINT "client_metrics_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "influencer_profiles" ADD CONSTRAINT "fk_influencer_affiliate" FOREIGN KEY ("user_id") REFERENCES "affiliate_codes"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_profiles" ADD CONSTRAINT "fk_influencer_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "intake_submissions" ADD CONSTRAINT "fk_user_intake" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "professional_clients" ADD CONSTRAINT "professional_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "professional_clients" ADD CONSTRAINT "professional_clients_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_affiliate_code_id_fkey" FOREIGN KEY ("affiliate_code_id") REFERENCES "affiliate_codes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_activation_tokens" ADD CONSTRAINT "user_activation_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_professional_roles" ADD CONSTRAINT "user_professional_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

