/*
  Warnings:

  - You are about to drop the `food_exchange_overrides` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "equivalentes_app"."food_exchange_overrides" DROP CONSTRAINT "fk_food_exchange_overrides_food";

-- DropForeignKey
ALTER TABLE "equivalentes_app"."food_exchange_overrides" DROP CONSTRAINT "fk_food_exchange_overrides_group_id";

-- DropForeignKey
ALTER TABLE "equivalentes_app"."food_exchange_overrides" DROP CONSTRAINT "fk_food_exchange_overrides_subgroup_id";

-- DropForeignKey
ALTER TABLE "equivalentes_app"."food_exchange_overrides" DROP CONSTRAINT "food_exchange_overrides_system_id_fkey";

-- DropTable
DROP TABLE "equivalentes_app"."food_exchange_overrides";
