UPDATE equivalentes_app.food_exchange_overrides feo
SET
  equivalent_portion_qty = CASE
    WHEN f.base_serving_size IS NOT NULL AND f.base_serving_size > 0
      THEN ROUND(f.base_serving_size::numeric, 2)
    ELSE NULL
  END,
  portion_unit = NULLIF(BTRIM(f.base_unit), '')
FROM nutrition.foods f
WHERE feo.food_id = f.id
  AND feo.system_id = 'mx_smae';
