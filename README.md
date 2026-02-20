# Calculadora SMAE + Intercambios (ManyChat Tracking)

Aplicación full-stack en monorepo para generar planes de equivalentes con tracking por `cid` (ManyChat Contact ID o identificador guest), usando una base de datos Postgres existente (`fitpilot`) y catálogo alimentario en `nutrition`.

## Stack

- Monorepo: `pnpm workspaces`
- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Node.js + Express + TypeScript
- DB: Postgres (Supabase), Prisma para schema `equivalentes_app`
- Shared package: tipos, validaciones y algoritmos
- Validación: Zod
- Calidad: ESLint + Prettier

## Estructura

- `apps/web`: SPA principal (`/`) + dashboard admin (`/admin`)
- `apps/api`: API Express + Prisma + integración ManyChat opcional
- `packages/shared`: tipos, schemas y algoritmos (kcal, equivalentes, ranking)

## Requisitos

- Node.js 22+
- Corepack habilitado (`corepack`)

## Configuración local

1. Instalar dependencias:

```bash
corepack prepare pnpm@9.15.4 --activate
corepack pnpm install
```

2. Copiar variables de entorno:

```bash
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env
```

3. Configurar `apps/api/.env` con tu `DATABASE_URL` real.

4. Crear tablas faltantes y seed en DB existente (baseline-safe):

```bash
corepack pnpm --filter @equivalentes/api db:setup
```

Esto crea y usa el schema `equivalentes_app` sin modificar estructura de `nutrition`.

## Variables de entorno

### `apps/api/.env`

- `PORT=4000`
- `DATABASE_URL="postgresql://..."`
- `PRISMA_CONNECTION_LIMIT=2`
- `PRISMA_POOL_TIMEOUT_SECONDS=20`
- `PG_POOL_MAX=2`
- `PG_POOL_MIN=0`
- `PG_IDLE_TIMEOUT_MS=10000`
- `PG_CONNECTION_TIMEOUT_MS=10000`
- `PG_MAX_USES=750`
- `WEB_ORIGIN="http://localhost:5173"`
- `WEB_ORIGINS="http://localhost:5173"` (CSV opcional; si se define, tiene prioridad sobre `WEB_ORIGIN`)
- `ADMIN_USER="admin"`
- `ADMIN_PASS="changeme"`
- `DB_APP_SCHEMA="equivalentes_app"`
- `DB_NUTRITION_SCHEMA="nutrition"`
- `MANYCHAT_ENABLED="false"`
- `MANYCHAT_API_TOKEN=""`
- `MANYCHAT_TAG_NAME="Uso_Equivalentes"`
- `MANYCHAT_CUSTOM_FIELD_NAME="last_equivalentes_use"`
- `MANYCHAT_CUSTOM_FIELD_CAMPAIGN="last_equivalentes_campaign"` (opcional)

### `apps/web/.env`

- `VITE_API_URL="http://localhost:4000"`
- `VITE_SHOW_ADMIN_LINK="true"`
- `VITE_CANONICAL_ORIGIN="http://localhost:5173"` (en produccion: `https://exchange-calculator.fitpilot.fit`)

## Scripts

- `corepack pnpm dev`: levanta API + Web
- `corepack pnpm lint`: lint workspace
- `corepack pnpm test`: tests unitarios (`packages/shared`)
- `corepack pnpm verify:release-sha`: valida que el commit checkout coincida con SHA esperado del entorno
- `corepack pnpm build`: build de todos los paquetes

## Flujo funcional

1. Entrada por WhatsApp (recomendada): ManyChat envía URL con `cid`:

```text
https://TU-DOMINIO.com/?cid={{subscriber_id}}&utm_source=manychat&utm_medium=whatsapp_broadcast&utm_campaign={{campaign_name_or_id}}&utm_content={{message_name_or_variant}}&mc_msg_id={{message_id}}
```

2. Entrada sin WhatsApp (guest): si no hay `cid` en URL, frontend crea/reutiliza `guest_*` en `localStorage`.
3. Frontend registra `open` en `POST /api/events` con `meta.source` (`whatsapp` o `guest`).
4. Usuario llena formulario (país, estado, fórmula kcal, sistema, perfil).
5. Backend genera plan dinámico por buckets (v2):
- Fórmulas: Mifflin, Harris revisada, Schofield.
- Equivalentes por sistema (SMAE MX + US/ES/AR graduales).
- Ranking de alimentos por geografía y perfil.
- Endpoint canónico: `POST /api/plans/generate`.
6. Se registra `generate` en `POST /api/events`.
7. **Lead Capture (Guest y WhatsApp):** Después de generar plan, se muestra el modal de captura de datos una sola vez por `cid` (opcional; se puede cerrar).
   - Datos: Nombre (requerido), Email, WhatsApp.
   - Se guarda en `leads` (`POST /api/leads`).
   - Cerrar o guardar marca el prompt como atendido para ese `cid`.
8. Exportación CSV/PDF registra `export`.
9. `/admin` muestra métricas, contactos y timeline por `cid`, con desglose por fuente.
10. `/admin` incluye resumen por campaña (`utm_campaign` + `mc_msg_id`) con métricas de eventos y únicos por CID.

## Dashboard admin

- Ruta: `http://localhost:5173/admin`
- Login por Basic Auth (UI pide user/pass).
- Consume:
  - `GET /api/admin/summary`
  - `GET /api/admin/contacts`
  - `GET /api/admin/contacts/:cid`

### Visibilidad del botón Admin (frontend)

- El botón `Admin` se muestra si `VITE_SHOW_ADMIN_LINK="true"`.
- También se muestra automáticamente si el host es `admin.*` (ej. `admin.tudominio.com`) o `admin.localhost`.
- Si ambas condiciones son falsas, el botón se oculta del menú.
- Esto no reemplaza seguridad: `/api/admin/*` sigue protegido por Basic Auth.

## ManyChat (opcional)

Si activas `MANYCHAT_ENABLED=true` y token, en evento `generate` se ejecuta:

- `POST /fb/subscriber/addTagByName`
- `POST /fb/subscriber/setCustomFieldByName`
- Opcional: `POST /fb/subscriber/setCustomFieldByName` para campaña si defines `MANYCHAT_CUSTOM_FIELD_CAMPAIGN`.

La sincronización ManyChat solo aplica para tráfico `whatsapp`; eventos `guest` se omiten de forma silenciosa.

Modo fail-soft: si falla ManyChat, no bloquea la generación local.

## API admin de campañas

- `GET /api/admin/campaigns?page=1&pageSize=20&days=30`
- `GET /api/admin/campaigns/contacts?utmCampaign=...&mcMsgId=...&page=1&pageSize=20`

Regla de KPI: "lead usó calculadora" = `generateUniqueCids` por campaña.

## Fórmulas y equivalentes

- Ajuste objetivo kcal:
  - mantener: `0%`
  - perder grasa: `-15%`
  - ganar músculo: `+10%`
- Macros por objetivo:
  - mantener: `45/25/30` (CHO/PRO/FAT)
  - perder grasa: `40/30/30`
  - ganar músculo: `50/25/25`
- Sistema de intercambios base:
  - carbohidrato: 15g CHO
  - proteína: 7g PRO
  - grasa: 5g FAT
  - verduras: 5g CHO + 2g PRO

## Pruebas ejecutadas

Se validó en este entorno:

- `corepack pnpm install`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm build`
- Smoke test API real:
  - `POST /api/events` (`open`, `generate`, `export`)
  - `POST /api/plans/generate`
  - `GET /api/admin/summary`
  - `GET /api/admin/contacts`
  - `GET /api/admin/contacts/TEST123`
- Preview web accesible en `http://127.0.0.1:4173/?cid=TEST123`.

## Despliegue

### Opción A (separado)

- API: Render / Fly / Railway
- Web: Vercel / Cloudflare Pages
- Configurar CORS con `WEB_ORIGINS` (CSV) y usar `WEB_ORIGIN` como fallback de compatibilidad.
- Producción recomendada (dominio canónico):
  - `WEB_ORIGINS="https://exchange-calculator.fitpilot.fit"`
- Mantener CORS estricto sin `onrender` en allowlist.
- Configurar redirección 301 del dominio técnico `exchange-calculator-web.onrender.com` al dominio canónico.
- Frontend: configurar `VITE_CANONICAL_ORIGIN="https://exchange-calculator.fitpilot.fit"` para fallback de redirección en runtime.
- Recomendado por visibilidad:
  - `app.tudominio.com` con `VITE_SHOW_ADMIN_LINK=false`.
  - `admin.tudominio.com` con `VITE_SHOW_ADMIN_LINK=false` (el botón aparece por host `admin.*`).
- Runbook recomendado de producción: `docs/DEPLOY-RUNBOOK-RENDER.md`.

## Carga de catalogos oficiales (US/ES/AR)

1. Importar catalogos canónicos:

```bash
corepack pnpm --filter @equivalentes/api catalog:import:us
corepack pnpm --filter @equivalentes/api catalog:import:es
corepack pnpm --filter @equivalentes/api catalog:import:ar
```

2. Reconstruir bucket profiles por sistema (version arbitraria `YYYYMMDD`):

```bash
corepack pnpm --filter @equivalentes/api sync:bucket-profiles --version 20260220 --system us_usda
corepack pnpm --filter @equivalentes/api sync:bucket-profiles --version 20260220 --system es_exchange
corepack pnpm --filter @equivalentes/api sync:bucket-profiles --version 20260220 --system ar_exchange
```

### Opción B (único servidor)

- Build de `web` y servir estáticos detrás de API/proxy.
- Mantener `VITE_API_URL` apuntando al mismo dominio.

## Notas operativas

- No se guardan datos sensibles de salud por defecto en `meta`.
- API mantiene `cid` obligatorio; frontend resuelve identidad automáticamente: `whatsapp` usa `cid` de querystring y `guest` genera/reutiliza `guest_*` en `localStorage`.
- `GET /health` expone `commitSha` para verificar que el despliegue y el commit esperado estén alineados.
- Las tablas nuevas viven en `equivalentes_app`.
- Se reutiliza catálogo en `nutrition`.
- Rotar credenciales/contraseñas compartidas en canales no seguros.
