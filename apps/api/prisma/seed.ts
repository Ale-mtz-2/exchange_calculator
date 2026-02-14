import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import {
  COUNTRY_STATES,
  DEFAULT_GROUPS_BY_SYSTEM,
  DEFAULT_SUBGROUP_POLICIES_BY_SYSTEM,
  DEFAULT_SUBGROUPS_BY_SYSTEM,
  EXCHANGE_SYSTEMS,
  KCAL_FORMULAS,
} from '@equivalentes/shared';

const prisma = new PrismaClient();

const MX_CLASSIFICATION_RULES = [
  {
    systemId: 'mx_smae',
    parentGroupCode: 'protein',
    subgroupCode: 'aoa_muy_bajo_grasa',
    minFatPer7gPro: 0,
    maxFatPer7gPro: 1.5,
    priority: 1,
  },
  {
    systemId: 'mx_smae',
    parentGroupCode: 'protein',
    subgroupCode: 'aoa_bajo_grasa',
    minFatPer7gPro: 1.5,
    maxFatPer7gPro: 4,
    priority: 2,
  },
  {
    systemId: 'mx_smae',
    parentGroupCode: 'protein',
    subgroupCode: 'aoa_moderado_grasa',
    minFatPer7gPro: 4,
    maxFatPer7gPro: 7,
    priority: 3,
  },
  {
    systemId: 'mx_smae',
    parentGroupCode: 'protein',
    subgroupCode: 'aoa_alto_grasa',
    minFatPer7gPro: 7,
    maxFatPer7gPro: null,
    priority: 4,
  },
] as const;

const MX_FOOD_CLASSIFICATION_CTE = `
  WITH latest_nutri AS (
    SELECT DISTINCT ON (fnv.food_id)
      fnv.food_id,
      COALESCE(fnv.protein_g, 0)::float8 AS protein_g,
      COALESCE(fnv.carbs_g, 0)::float8 AS carbs_g,
      COALESCE(fnv.fat_g, 0)::float8 AS fat_g,
      COALESCE(fnv.base_serving_size, 100)::float8 AS serving_qty,
      COALESCE(fnv.base_unit, 'g') AS serving_unit
    FROM nutrition.food_nutrition_values fnv
    WHERE fnv.deleted_at IS NULL
    ORDER BY fnv.food_id,
      CASE WHEN fnv.state = 'standard' THEN 0 ELSE 1 END,
      fnv.id DESC
  ),
  base AS (
    SELECT
      f.id AS food_id,
      lower(COALESCE(f.name, '')) AS food_name,
      lower(COALESCE(fc.name, '')) AS category_name,
      lower(COALESCE(ng.name, '')) AS exchange_group_name,
      COALESCE(ln.protein_g, f.protein_g, 0)::float8 AS protein_g,
      COALESCE(ln.carbs_g, f.carbs_g, 0)::float8 AS carbs_g,
      COALESCE(ln.fat_g, f.fat_g, 0)::float8 AS fat_g,
      COALESCE(ln.serving_qty, f.base_serving_size, 100)::float8 AS serving_qty,
      COALESCE(ln.serving_unit, f.base_unit, 'g') AS serving_unit
    FROM nutrition.foods f
    LEFT JOIN nutrition.food_categories fc ON fc.id = f.category_id
    LEFT JOIN nutrition.exchange_groups ng ON ng.id = f.exchange_group_id
    LEFT JOIN latest_nutri ln ON ln.food_id = f.id
  ),
  classified AS (
    SELECT
      b.*,
      CASE
        WHEN (b.exchange_group_name LIKE '%grasa%' OR b.category_name LIKE '%grasa%') THEN 'fat'
        WHEN (b.exchange_group_name LIKE '%verdura%' OR b.category_name LIKE '%verdura%') THEN 'vegetable'
        WHEN (b.exchange_group_name LIKE '%fruta%' OR b.category_name LIKE '%fruta%') THEN 'fruit'
        WHEN (b.exchange_group_name LIKE '%prote%' OR b.category_name LIKE '%prote%') THEN
          CASE
            WHEN (
              b.food_name ~ '(frijol|lenteja|garbanzo|haba|edamame|soya|soja|alubia|judia|chicharo|chichar)'
              OR b.category_name LIKE '%legum%'
              OR (b.protein_g >= 6 AND b.carbs_g >= 10 AND b.fat_g <= 6)
            ) THEN 'legume'
            ELSE 'protein'
          END
        ELSE 'carb'
      END AS group_code,
      CASE
        WHEN (b.exchange_group_name LIKE '%prote%' OR b.category_name LIKE '%prote%')
          AND NOT (
            b.food_name ~ '(frijol|lenteja|garbanzo|haba|edamame|soya|soja|alubia|judia|chicharo|chichar)'
            OR b.category_name LIKE '%legum%'
            OR (b.protein_g >= 6 AND b.carbs_g >= 10 AND b.fat_g <= 6)
          )
        THEN COALESCE(
          (
            SELECT r.subgroup_code
            FROM equivalentes_app.subgroup_classification_rules r
            WHERE r.system_id = 'mx_smae'
              AND r.parent_group_code = 'protein'
              AND r.is_active = true
              AND ((b.fat_g / GREATEST(b.protein_g, 0.1)) * 7) >= r.min_fat_per_7g_pro
              AND (r.max_fat_per_7g_pro IS NULL OR ((b.fat_g / GREATEST(b.protein_g, 0.1)) * 7) < r.max_fat_per_7g_pro)
            ORDER BY r.priority ASC
            LIMIT 1
          ),
          'aoa_bajo_grasa'
        )
        ELSE NULL
      END AS subgroup_code
    FROM base b
  )
`;

const seed = async (): Promise<void> => {
  for (const formula of KCAL_FORMULAS) {
    await prisma.kcalFormula.upsert({
      where: { id: formula.id },
      update: {
        name: formula.name,
        description: formula.description,
        isActive: true,
        sortOrder: formula.sortOrder,
      },
      create: {
        id: formula.id,
        name: formula.name,
        description: formula.description,
        isActive: true,
        sortOrder: formula.sortOrder,
      },
    });
  }

  for (const system of EXCHANGE_SYSTEMS) {
    await prisma.exchangeSystem.upsert({
      where: { id: system.id },
      update: {
        countryCode: system.countryCode,
        name: system.name,
        source: system.source,
        isActive: system.isActive,
      },
      create: {
        id: system.id,
        countryCode: system.countryCode,
        name: system.name,
        source: system.source,
        isActive: system.isActive,
      },
    });
  }

  for (const [systemId, groups] of Object.entries(DEFAULT_GROUPS_BY_SYSTEM)) {
    for (const group of groups) {
      await prisma.exchangeGroup.upsert({
        where: {
          systemId_groupCode: {
            systemId,
            groupCode: group.groupCode,
          },
        },
        update: {
          displayNameEs: group.displayNameEs,
          choG: group.choG,
          proG: group.proG,
          fatG: group.fatG,
          kcalTarget: group.kcalTarget,
          sortOrder: group.sortOrder,
        },
        create: {
          systemId,
          groupCode: group.groupCode,
          displayNameEs: group.displayNameEs,
          choG: group.choG,
          proG: group.proG,
          fatG: group.fatG,
          kcalTarget: group.kcalTarget,
          sortOrder: group.sortOrder,
        },
      });
    }
  }

  for (const [systemId, subgroups] of Object.entries(DEFAULT_SUBGROUPS_BY_SYSTEM)) {
    for (const subgroup of subgroups ?? []) {
      const parentGroup = await prisma.exchangeGroup.findUnique({
        where: {
          systemId_groupCode: {
            systemId,
            groupCode: subgroup.parentGroupCode,
          },
        },
      });

      if (!parentGroup) {
        throw new Error(`Parent group ${subgroup.parentGroupCode} not found for ${systemId}`);
      }

      await prisma.exchangeSubgroup.upsert({
        where: {
          systemId_subgroupCode: {
            systemId,
            subgroupCode: subgroup.subgroupCode,
          },
        },
        update: {
          parentGroupId: parentGroup.id,
          displayNameEs: subgroup.displayNameEs,
          choG: subgroup.choG,
          proG: subgroup.proG,
          fatG: subgroup.fatG,
          kcalTarget: subgroup.kcalTarget,
          sortOrder: subgroup.sortOrder,
          isActive: true,
        },
        create: {
          systemId,
          parentGroupId: parentGroup.id,
          subgroupCode: subgroup.subgroupCode,
          displayNameEs: subgroup.displayNameEs,
          choG: subgroup.choG,
          proG: subgroup.proG,
          fatG: subgroup.fatG,
          kcalTarget: subgroup.kcalTarget,
          sortOrder: subgroup.sortOrder,
          isActive: true,
        },
      });
    }
  }

  for (const [systemId, policies] of Object.entries(DEFAULT_SUBGROUP_POLICIES_BY_SYSTEM)) {
    for (const policy of policies ?? []) {
      await prisma.subgroupSelectionPolicy.upsert({
        where: {
          systemId_goal_dietPattern_subgroupCode: {
            systemId,
            goal: policy.goal,
            dietPattern: policy.dietPattern,
            subgroupCode: policy.subgroupCode,
          },
        },
        update: {
          targetSharePct: policy.targetSharePct,
          scoreAdjustment: policy.scoreAdjustment,
          isActive: true,
        },
        create: {
          systemId,
          goal: policy.goal,
          dietPattern: policy.dietPattern,
          subgroupCode: policy.subgroupCode,
          targetSharePct: policy.targetSharePct,
          scoreAdjustment: policy.scoreAdjustment,
          isActive: true,
        },
      });
    }
  }

  for (const rule of MX_CLASSIFICATION_RULES) {
    await prisma.subgroupClassificationRule.upsert({
      where: {
        systemId_parentGroupCode_subgroupCode_priority: {
          systemId: rule.systemId,
          parentGroupCode: rule.parentGroupCode,
          subgroupCode: rule.subgroupCode,
          priority: rule.priority,
        },
      },
      update: {
        minFatPer7gPro: rule.minFatPer7gPro,
        maxFatPer7gPro: rule.maxFatPer7gPro,
        isActive: true,
      },
      create: {
        systemId: rule.systemId,
        parentGroupCode: rule.parentGroupCode,
        subgroupCode: rule.subgroupCode,
        minFatPer7gPro: rule.minFatPer7gPro,
        maxFatPer7gPro: rule.maxFatPer7gPro,
        priority: rule.priority,
        isActive: true,
      },
    });
  }

  const statesData = Object.entries(COUNTRY_STATES).flatMap(([countryCode, states]) =>
    states.map((state) => ({
      countryCode,
      stateCode: state.code,
      stateName: state.name,
    })),
  );

  await prisma.countryState.createMany({
    data: statesData,
    skipDuplicates: true,
  });

  await prisma.$executeRawUnsafe(`
    ${MX_FOOD_CLASSIFICATION_CTE}
    INSERT INTO equivalentes_app.food_exchange_overrides (
      food_id,
      system_id,
      exchange_group_id,
      exchange_subgroup_id,
      equivalent_portion_qty,
      portion_unit,
      is_active
    )
    SELECT
      c.food_id,
      'mx_smae',
      eg.id,
      NULL,
      1,
      c.serving_unit,
      true
    FROM classified c
    JOIN equivalentes_app.exchange_groups eg
      ON eg.system_id = 'mx_smae'
      AND eg.group_code = c.group_code
    ON CONFLICT (food_id, system_id) DO NOTHING;
  `);

  await prisma.$executeRawUnsafe(`
    ${MX_FOOD_CLASSIFICATION_CTE}
    UPDATE equivalentes_app.food_exchange_overrides feo
    SET
      exchange_group_id = eg.id,
      exchange_subgroup_id = es.id,
      equivalent_portion_qty = COALESCE(feo.equivalent_portion_qty, 1),
      portion_unit = COALESCE(feo.portion_unit, c.serving_unit),
      is_active = true
    FROM classified c
    JOIN equivalentes_app.exchange_groups eg
      ON eg.system_id = 'mx_smae'
      AND eg.group_code = c.group_code
    LEFT JOIN equivalentes_app.exchange_subgroups es
      ON es.system_id = 'mx_smae'
      AND es.subgroup_code = c.subgroup_code
    WHERE feo.system_id = 'mx_smae'
      AND feo.food_id = c.food_id
      AND feo.exchange_subgroup_id IS NULL;
  `);
};

seed()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed completed');
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
