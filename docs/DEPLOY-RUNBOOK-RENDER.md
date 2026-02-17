# Runbook de Despliegue (Render)

Este runbook aplica para el flujo hardcut (catalogo nativo en `nutrition` + perfiles en `equivalentes_app`).

## 1) Publicar codigo correcto

```bash
git checkout main
git status
git log --oneline origin/main..HEAD
git push origin main
```

Confirmar que Render este apuntando a `main`.

## 2) Build y start del servicio API

- Build command: `pnpm build`
- Start command: `pnpm --filter @equivalentes/api start`

`pnpm build` ahora ejecuta `verify:release-sha`, que compara:

- `git rev-parse HEAD` (commit real del checkout)
- contra `EXPECTED_RELEASE_SHA`, o `RENDER_GIT_COMMIT`, o `GITHUB_SHA` (el primero disponible)

Si no coinciden, el build falla.

## 3) Post-deploy DB checklist (produccion)

Ejecutar en shell del servicio (o job controlado):

```bash
pnpm --filter @equivalentes/api exec prisma migrate status --schema prisma/schema.prisma
pnpm --filter @equivalentes/api prisma:migrate
pnpm --filter @equivalentes/api prisma:seed
pnpm --filter @equivalentes/api sync:bucket-profiles
```

No usar `db:setup` en produccion ya existente.

## 4) Smoke tests

1. `GET /health` -> `200` y `commitSha` correcto.
2. `GET /api/options` -> `200` y llaves esperadas:
   - `systems`
   - `groupsBySystem`
   - `subgroupsBySystem`
   - `subgroupPoliciesBySystem`
3. `POST /api/plans/generate` -> `201`.

## 5) Monitoreo de regresiones (10-15 min)

Buscar ausencia de errores legacy:

- `exchangeGroup.findMany`
- `exchangeSubgroup.findMany`
- `subgroup_selection_policies.subgroup_code does not exist`

Si aparecen, forzar redeploy desde commit confirmado en `main`.
