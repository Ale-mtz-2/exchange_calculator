CREATE TABLE IF NOT EXISTS equivalentes_app.backup_20260218234500_mx_foods AS
SELECT f.*
FROM nutrition.foods f
JOIN nutrition.exchange_groups eg ON eg.id = f.exchange_group_id
JOIN nutrition.exchange_systems es ON es.id = eg.system_id
WHERE translate(lower(COALESCE(es.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') SIMILAR TO '%(smae|mex)%';

CREATE TABLE IF NOT EXISTS equivalentes_app.backup_20260218234500_mx_fnv_active AS
SELECT fnv.*
FROM nutrition.food_nutrition_values fnv
LEFT JOIN nutrition.data_sources ds ON ds.id = fnv.data_source_id
WHERE fnv.deleted_at IS NULL
  AND translate(lower(COALESCE(ds.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') SIMILAR TO '%(smae|mex)%';

CREATE TABLE IF NOT EXISTS equivalentes_app.backup_20260218234500_mx_overrides AS
SELECT *
FROM equivalentes_app.food_exchange_overrides
WHERE system_id = 'mx_smae';

CREATE TEMP TABLE tmp_mx_serving_resolution ON COMMIT DROP AS
WITH latest_nutri AS (
  SELECT DISTINCT ON (fnv.food_id)
    fnv.food_id,
    COALESCE(fnv.calories_kcal, 0)::float8 AS calories_kcal,
    COALESCE(fnv.protein_g, 0)::float8 AS protein_g,
    COALESCE(fnv.carbs_g, 0)::float8 AS carbs_g,
    COALESCE(fnv.fat_g, 0)::float8 AS fat_g,
    CASE
      WHEN fnv.base_serving_size IS NOT NULL AND fnv.base_serving_size > 0
        THEN fnv.base_serving_size::float8
      ELSE NULL
    END AS base_serving_size,
    NULLIF(BTRIM(fnv.base_unit), '') AS base_unit
  FROM nutrition.food_nutrition_values fnv
  LEFT JOIN nutrition.data_sources ds ON ds.id = fnv.data_source_id
  JOIN nutrition.foods f ON f.id = fnv.food_id
  JOIN nutrition.exchange_groups eg ON eg.id = f.exchange_group_id
  JOIN nutrition.exchange_systems es ON es.id = eg.system_id
  WHERE fnv.deleted_at IS NULL
    AND translate(lower(COALESCE(es.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') SIMILAR TO '%(smae|mex)%'
  ORDER BY fnv.food_id,
    CASE WHEN fnv.state = 'standard' THEN 0 ELSE 1 END,
    CASE
      WHEN translate(lower(COALESCE(ds.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') LIKE '%smae%' THEN 0
      WHEN translate(lower(COALESCE(ds.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') LIKE '%mex%' THEN 1
      ELSE 2
    END,
    fnv.id DESC
),
serving_candidates AS (
  SELECT
    su.food_id,
    su.gram_equivalent::float8 AS serving_qty,
    NULLIF(BTRIM(su.unit_name), '') AS serving_label,
    CASE
      WHEN su.gram_equivalent <> 100 THEN 1
      WHEN translate(lower(COALESCE(su.unit_name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun')
        ~ '(pieza|rebanad|taza|cucharad|envase|vaso|unidad)' THEN 1
      ELSE 0
    END AS is_high_conf,
    CASE
      WHEN translate(lower(COALESCE(su.unit_name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') LIKE '%porcion equivalente%' THEN 1
      WHEN translate(lower(COALESCE(su.unit_name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') LIKE '%porcion estandar%' THEN 1
      ELSE 0
    END AS is_generic,
    su.id
  FROM nutrition.serving_units su
  WHERE su.is_exchange_unit = true
    AND su.gram_equivalent IS NOT NULL
    AND su.gram_equivalent > 0
),
best_serving AS (
  SELECT DISTINCT ON (sc.food_id)
    sc.food_id,
    sc.serving_qty,
    sc.is_high_conf
  FROM serving_candidates sc
  ORDER BY sc.food_id,
    sc.is_high_conf DESC,
    CASE WHEN sc.is_high_conf = 1 AND sc.is_generic = 0 THEN 0 ELSE 1 END,
    CASE WHEN sc.serving_qty <> 100 THEN 0 ELSE 1 END,
    sc.id ASC
),
base AS (
  SELECT
    f.id AS food_id,
    translate(lower(COALESCE(f.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') AS food_name_norm,
    translate(lower(COALESCE(fc.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') AS category_name_norm,
    translate(lower(COALESCE(eg.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') AS exchange_group_name_norm,
    COALESCE(ln.calories_kcal, f.calories_kcal, 0)::float8 AS calories_kcal,
    COALESCE(ln.protein_g, f.protein_g, 0)::float8 AS protein_g,
    COALESCE(ln.carbs_g, f.carbs_g, 0)::float8 AS carbs_g,
    COALESCE(ln.fat_g, f.fat_g, 0)::float8 AS fat_g,
    CASE
      WHEN f.base_serving_size IS NOT NULL AND f.base_serving_size > 0
        THEN f.base_serving_size::float8
      ELSE NULL
    END AS current_serving_qty,
    NULLIF(BTRIM(f.base_unit), '') AS current_serving_unit,
    COALESCE(NULLIF(ln.base_serving_size, 0), 100)::float8 AS old_serving_ref,
    bs.serving_qty AS serving_qty_candidate,
    bs.is_high_conf AS serving_is_high_conf
  FROM nutrition.foods f
  JOIN nutrition.exchange_groups eg ON eg.id = f.exchange_group_id
  JOIN nutrition.exchange_systems es ON es.id = eg.system_id
  LEFT JOIN nutrition.food_categories fc ON fc.id = f.category_id
  LEFT JOIN latest_nutri ln ON ln.food_id = f.id
  LEFT JOIN best_serving bs ON bs.food_id = f.id
  WHERE translate(lower(COALESCE(es.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') SIMILAR TO '%(smae|mex)%'
),
classified AS (
  SELECT
    b.*,
    CASE
      WHEN (b.exchange_group_name_norm LIKE '%grasa%' OR b.category_name_norm LIKE '%grasa%') THEN 'fat'
      WHEN (b.exchange_group_name_norm LIKE '%verdura%' OR b.category_name_norm LIKE '%verdura%') THEN 'vegetable'
      WHEN (b.exchange_group_name_norm LIKE '%fruta%' OR b.category_name_norm LIKE '%fruta%') THEN 'fruit'
      WHEN (b.exchange_group_name_norm LIKE '%leche%' OR b.category_name_norm LIKE '%lacteo%') THEN 'milk'
      WHEN (b.exchange_group_name_norm LIKE '%azucar%' OR b.category_name_norm LIKE '%azucar%') THEN 'sugar'
      WHEN (b.exchange_group_name_norm LIKE '%prote%' OR b.category_name_norm LIKE '%prote%') THEN
        CASE
          WHEN (
            b.food_name_norm ~ '(frijol|lenteja|garbanzo|haba|edamame|soya|soja|alubia|judia|chicharo|chichar)'
            OR b.category_name_norm LIKE '%legum%'
            OR (b.protein_g >= 6 AND b.carbs_g >= 10 AND b.fat_g <= 6)
          ) THEN 'legume'
          ELSE 'protein'
        END
      ELSE 'carb'
    END AS group_code,
    CASE
      WHEN (
        (b.exchange_group_name_norm LIKE '%prote%' OR b.category_name_norm LIKE '%prote%')
        AND NOT (
          b.food_name_norm ~ '(frijol|lenteja|garbanzo|haba|edamame|soya|soja|alubia|judia|chicharo|chichar)'
          OR b.category_name_norm LIKE '%legum%'
          OR (b.protein_g >= 6 AND b.carbs_g >= 10 AND b.fat_g <= 6)
        )
      ) THEN
        CASE
          WHEN ((b.fat_g / GREATEST(b.protein_g, 0.1)) * 7) < 1.5 THEN 'aoa_muy_bajo_grasa'
          WHEN ((b.fat_g / GREATEST(b.protein_g, 0.1)) * 7) < 4 THEN 'aoa_bajo_grasa'
          WHEN ((b.fat_g / GREATEST(b.protein_g, 0.1)) * 7) < 7 THEN 'aoa_moderado_grasa'
          ELSE 'aoa_alto_grasa'
        END
      WHEN (b.exchange_group_name_norm LIKE '%cereal%' OR b.category_name_norm LIKE '%cereal%' OR b.category_name_norm LIKE '%tuberc%')
        THEN CASE WHEN b.fat_g <= 1 THEN 'cereal_sin_grasa' ELSE 'cereal_con_grasa' END
      WHEN (b.exchange_group_name_norm LIKE '%leche%' OR b.category_name_norm LIKE '%lacteo%')
        THEN CASE
          WHEN b.carbs_g > 20 THEN 'leche_con_azucar'
          WHEN b.fat_g <= 2 THEN 'leche_descremada'
          WHEN b.fat_g <= 5 THEN 'leche_semidescremada'
          ELSE 'leche_entera'
        END
      WHEN (b.exchange_group_name_norm LIKE '%azucar%' OR b.category_name_norm LIKE '%azucar%')
        THEN CASE WHEN b.fat_g <= 1 THEN 'azucar_sin_grasa' ELSE 'azucar_con_grasa' END
      WHEN (b.exchange_group_name_norm LIKE '%grasa%' OR b.category_name_norm LIKE '%grasa%')
        THEN CASE WHEN b.protein_g >= 1.5 THEN 'grasa_con_proteina' ELSE 'grasa_sin_proteina' END
      ELSE NULL
    END AS subgroup_code
  FROM base b
),
targets AS (
  SELECT
    c.*,
    CASE
      WHEN c.subgroup_code = 'aoa_muy_bajo_grasa' THEN 7
      WHEN c.subgroup_code = 'aoa_bajo_grasa' THEN 7
      WHEN c.subgroup_code = 'aoa_moderado_grasa' THEN 7
      WHEN c.subgroup_code = 'aoa_alto_grasa' THEN 7
      WHEN c.subgroup_code = 'cereal_sin_grasa' THEN 15
      WHEN c.subgroup_code = 'cereal_con_grasa' THEN 15
      WHEN c.subgroup_code = 'leche_con_azucar' THEN 30
      WHEN c.subgroup_code IN ('leche_descremada', 'leche_semidescremada', 'leche_entera') THEN 12
      WHEN c.subgroup_code IN ('azucar_sin_grasa', 'azucar_con_grasa') THEN 10
      WHEN c.group_code = 'vegetable' THEN 4
      WHEN c.group_code = 'fruit' THEN 15
      WHEN c.group_code = 'carb' THEN 15
      WHEN c.group_code = 'milk' THEN 12
      WHEN c.group_code = 'sugar' THEN 10
      WHEN c.group_code = 'legume' THEN 20
      ELSE NULL
    END::float8 AS target_cho,
    CASE
      WHEN c.group_code = 'legume' THEN 8
      WHEN c.subgroup_code LIKE 'aoa_%' THEN 7
      ELSE NULL
    END::float8 AS target_pro,
    CASE
      WHEN c.subgroup_code IN ('grasa_sin_proteina', 'grasa_con_proteina') THEN 5
      WHEN c.group_code = 'fat' THEN 5
      ELSE NULL
    END::float8 AS target_fat
  FROM classified c
),
estimated AS (
  SELECT
    t.*,
    GREATEST(
      COALESCE(CASE WHEN t.target_cho IS NOT NULL AND t.target_cho > 0 THEN 100.0 * t.target_cho / GREATEST(t.carbs_g, 0.1) END, 0),
      COALESCE(CASE WHEN t.target_pro IS NOT NULL AND t.target_pro > 0 THEN 100.0 * t.target_pro / GREATEST(t.protein_g, 0.1) END, 0),
      COALESCE(CASE WHEN t.target_fat IS NOT NULL AND t.target_fat > 0 THEN 100.0 * t.target_fat / GREATEST(t.fat_g, 0.1) END, 0)
    ) AS target_serving_raw
  FROM targets t
),
resolved AS (
  SELECT
    e.food_id,
    e.group_code,
    e.subgroup_code,
    ROUND(
      CASE
        WHEN e.current_serving_qty IS NOT NULL
          AND e.current_serving_qty > 0
          AND ABS(e.current_serving_qty - 100) > 0.0001
          THEN e.current_serving_qty
        WHEN e.serving_is_high_conf = 1
          AND e.serving_qty_candidate IS NOT NULL
          AND e.serving_qty_candidate > 0
          THEN e.serving_qty_candidate
        WHEN e.target_serving_raw IS NOT NULL
          AND e.target_serving_raw > 0
          THEN CASE
            WHEN e.group_code = 'vegetable' THEN LEAST(250, GREATEST(40, e.target_serving_raw))
            WHEN e.group_code = 'fruit' THEN LEAST(250, GREATEST(60, e.target_serving_raw))
            WHEN e.group_code = 'carb' THEN LEAST(200, GREATEST(20, e.target_serving_raw))
            WHEN e.group_code = 'legume' THEN LEAST(180, GREATEST(30, e.target_serving_raw))
            WHEN e.group_code = 'protein' THEN LEAST(120, GREATEST(20, e.target_serving_raw))
            WHEN e.group_code = 'milk' THEN LEAST(350, GREATEST(100, e.target_serving_raw))
            WHEN e.group_code = 'fat' THEN LEAST(30, GREATEST(5, e.target_serving_raw))
            WHEN e.group_code = 'sugar' THEN LEAST(80, GREATEST(5, e.target_serving_raw))
            ELSE LEAST(300, GREATEST(10, e.target_serving_raw))
          END
        ELSE CASE
          WHEN e.group_code = 'vegetable' THEN 100
          WHEN e.group_code = 'fruit' THEN 120
          WHEN e.group_code = 'carb' THEN 150
          WHEN e.group_code = 'legume' THEN 100
          WHEN e.group_code = 'protein' THEN 100
          WHEN e.group_code = 'milk' THEN 240
          WHEN e.group_code = 'fat' THEN 15
          WHEN e.group_code = 'sugar' THEN 10
          ELSE 100
        END
      END::numeric,
      2
    )::float8 AS final_serving_qty,
    CASE
      WHEN e.current_serving_qty IS NOT NULL
        AND e.current_serving_qty > 0
        AND ABS(e.current_serving_qty - 100) > 0.0001
        THEN COALESCE(e.current_serving_unit, CASE WHEN e.group_code = 'milk' THEN 'ml' ELSE 'g' END)
      WHEN e.group_code = 'milk' THEN 'ml'
      ELSE 'g'
    END AS final_serving_unit,
    COALESCE(NULLIF(e.old_serving_ref, 0), 100)::float8 AS old_serving_ref,
    e.calories_kcal,
    e.protein_g,
    e.carbs_g,
    e.fat_g
  FROM estimated e
)
SELECT
  r.food_id,
  r.group_code,
  r.subgroup_code,
  r.final_serving_qty,
  r.final_serving_unit,
  r.old_serving_ref,
  r.calories_kcal,
  r.protein_g,
  r.carbs_g,
  r.fat_g
FROM resolved r;

UPDATE nutrition.foods f
SET
  base_serving_size = t.final_serving_qty,
  base_unit = t.final_serving_unit,
  calories_kcal = ROUND((t.calories_kcal::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(t.old_serving_ref, 0), 100)::numeric), 2),
  protein_g = ROUND((t.protein_g::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(t.old_serving_ref, 0), 100)::numeric), 2),
  carbs_g = ROUND((t.carbs_g::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(t.old_serving_ref, 0), 100)::numeric), 2),
  fat_g = ROUND((t.fat_g::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(t.old_serving_ref, 0), 100)::numeric), 2)
FROM tmp_mx_serving_resolution t
WHERE f.id = t.food_id;

UPDATE nutrition.food_nutrition_values fnv
SET
  base_serving_size = t.final_serving_qty,
  base_unit = t.final_serving_unit,
  calories_kcal = CASE
    WHEN fnv.calories_kcal IS NULL THEN NULL
    ELSE ROUND((fnv.calories_kcal::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
  END,
  protein_g = CASE
    WHEN fnv.protein_g IS NULL THEN NULL
    ELSE ROUND((fnv.protein_g::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
  END,
  carbs_g = CASE
    WHEN fnv.carbs_g IS NULL THEN NULL
    ELSE ROUND((fnv.carbs_g::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
  END,
  fat_g = CASE
    WHEN fnv.fat_g IS NULL THEN NULL
    ELSE ROUND((fnv.fat_g::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
  END,
  fiber_g = CASE
    WHEN fnv.fiber_g IS NULL THEN NULL
    ELSE ROUND((fnv.fiber_g::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
  END,
  glycemic_load = CASE
    WHEN fnv.glycemic_load IS NULL THEN NULL
    ELSE ROUND((fnv.glycemic_load::numeric * t.final_serving_qty::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
  END
FROM tmp_mx_serving_resolution t
WHERE fnv.food_id = t.food_id
  AND fnv.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM nutrition.data_sources ds
    WHERE ds.id = fnv.data_source_id
      AND translate(lower(COALESCE(ds.name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') SIMILAR TO '%(smae|mex)%'
  );

UPDATE equivalentes_app.food_exchange_overrides feo
SET
  equivalent_portion_qty = ROUND(t.final_serving_qty::numeric, 2),
  portion_unit = t.final_serving_unit
FROM tmp_mx_serving_resolution t
WHERE feo.food_id = t.food_id
  AND feo.system_id = 'mx_smae';

