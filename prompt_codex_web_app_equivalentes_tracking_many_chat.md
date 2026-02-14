# Prompt para Codex (crear proyecto full‑stack desde 0)

Eres **OpenAI Codex** trabajando como un agente de programación autónomo dentro de un repositorio vacío. Quiero que **crees TODO el proyecto desde cero** (archivos, estructura, scripts, README) y verifiques tu trabajo ejecutando comandos.

## 0) Reglas de trabajo
- No pidas aclaraciones; **toma decisiones razonables** y documenta supuestos en el README.
- Trabaja por etapas pequeñas: scaffold → backend → frontend → integración → dashboard → calidad → docs.
- Después de cada etapa, **ejecuta** los comandos necesarios y corrige errores.
- Usa TypeScript en frontend y backend.
- Mantén el proyecto simple, legible y listo para desplegar.

---

## 1) Objetivo del producto
Construye una **web app entregable** para leads/pacientes a la que llegarán desde **WhatsApp (ManyChat)**.

Quiero poder saber **quién la usó** y **qué hizo**, usando un enlace con un parámetro único enviado por ManyChat.

### Flujo esperado
1) En ManyChat se envía un botón URL con un parámetro `cid` (Contact ID):
   - Ejemplo: `https://TU-DOMINIO.com/?cid={{contact_id}}`
2) Cuando el usuario abre la página, la app registra evento `open`.
3) El usuario llena datos y genera una **tabla de equivalentes**. Al generar, registra evento `generate`.
4) Opcional: exporta a PDF/CSV (registra evento `export`).
5) Debe existir un **dashboard admin** para ver:
   - lista de `cid` con **primer uso, último uso, eventos y conteos**.

---

## 2) Stack y arquitectura (elige esto)
- **Monorepo** con **pnpm workspaces**.
- Frontend: **React + Vite + TypeScript + Tailwind**.
- Backend: **Node.js + Express + TypeScript**.
- BD local: **SQLite** usando **Prisma** (para que pueda migrar a Postgres después sin drama).
- Validación: **zod**.
- Calidad: **eslint + prettier**.

Estructura:
- `apps/web` (frontend)
- `apps/api` (backend)
- `packages/shared` (tipos/validaciones compartidas)
- `README.md` con instrucciones paso a paso
- `.env.example` para ambos

---

## 3) Requisitos funcionales

### 3.1 Tracking de uso (lo más importante)
- El frontend debe leer `cid` desde querystring.
- Si no hay `cid`, mostrar una pantalla amable: “Este enlace es personal, vuelve a abrirlo desde WhatsApp”.
- Al detectar `cid`, mandar POST al backend: `POST /api/events`.
- Eventos mínimos: `open`, `generate`, `export`.
- Guardar en BD:
  - `id` (uuid)
  - `cid` (string)
  - `event` (enum/string)
  - `createdAt`
  - `userAgent` (string)
  - `ip` (string, best-effort)
  - `meta` (JSON opcional: por ejemplo peso/objetivo pero **sin datos sensibles** por default)

### 3.2 Integración opcional con ManyChat (feature flag)
Si se configuran variables de entorno, cuando llegue `generate`:
- Llamar a ManyChat API para:
  - **Agregar tag** por nombre (ej. `Uso_Equivalentes`) al contacto `cid`.
  - **Set custom field** (ej. `last_equivalentes_use`) con timestamp ISO.

Si no hay token/config, el sistema debe funcionar igual (solo registra local).

### 3.3 Herramienta: generador de tabla de equivalentes
Implementa una versión MVP:
- UI con formulario:
  - Objetivo (mantener / perder grasa / ganar músculo)
  - Peso (kg), estatura (cm), edad, sexo
  - Nivel actividad (bajo/medio/alto)
  - Preferencia de comidas por día (3/4/5)
- Calcula calorías/macro target aproximado (documenta fórmula usada).
- Genera una **tabla de equivalentes por grupo** usando un sistema simple de intercambios:
  - Carbohidrato = 15g CHO
  - Proteína = 7g PRO
  - Grasa = 5g FAT
  - Verduras = 5g CHO + 2g PRO (aprox)

Incluye una mini base local (JSON) con alimentos ejemplo (tortilla, arroz, avena, pollo, atún, huevo, aguacate, aceite de oliva, etc.) con macros por porción.
- La tabla debe mostrar:
  - Grupo
  - Cantidad de equivalentes/día
  - Ejemplos de porciones equivalentes (2–4 opciones por grupo)

### 3.4 Dashboard admin
- Ruta: `/admin`
- Protegido con **Basic Auth** (user/pass en env).
- Vista con:
  - Total de `cid` únicos
  - Eventos por día (últimos 14 días)
  - Tabla: `cid`, firstSeen, lastSeen, openCount, generateCount, exportCount
  - Detalle por `cid` (click row → modal/drawer) con timeline de eventos

### 3.5 UX
- Diseño limpio, rápido.
- Mobile-first.
- Mensajes en español.

---

## 4) Requisitos técnicos

### 4.1 Backend (Express)
- `POST /api/events`
  - body: `{ cid: string, event: 'open'|'generate'|'export', meta?: object }`
  - valida con zod
  - persiste en Prisma
  - si `event==='generate'` y está activado ManyChat: llama API y registra resultado en logs

- `GET /api/admin/summary`
  - protegido por Basic Auth
  - devuelve agregados para dashboard

- `GET /api/admin/contacts`
  - lista paginada

- `GET /api/admin/contacts/:cid`
  - eventos por contacto

CORS:
- Permite origen del frontend (env `WEB_ORIGIN`).

### 4.2 Frontend (React)
- Página principal `/`:
  - Lee `cid`
  - Dispara `open`
  - Formulario → al submit:
    - genera equivalentes
    - dispara `generate`
  - Botón export (CSV y/o imprimir a PDF usando `window.print()`):
    - dispara `export`

- Página `/admin`:
  - UI dashboard (consume endpoints admin)

### 4.3 DB (Prisma)
Modelos sugeridos:
- `Event` (id, cid, event, metaJson, userAgent, ip, createdAt)

Agregación:
- Usa queries Prisma + groupBy o SQL raw si hace falta.

---

## 5) Entregables obligatorios
1) Repositorio completo con todos los archivos.
2) Scripts pnpm:
   - `pnpm dev` (levanta web y api)
   - `pnpm lint`
   - `pnpm test` (mínimo unit tests para cálculo de macros y parser de equivalentes)
3) `README.md` (en español) con:
   - Requisitos (Node, pnpm)
   - Setup paso a paso
   - Variables de entorno
   - Cómo configurar ManyChat link (`cid`) y qué tag/campo usa
   - Cómo ver el dashboard
4) `.env.example` en `apps/api` y `apps/web`.
5) Pequeña guía de despliegue:
   - Opción A: Render/Fly/Vercel para API + Vercel/CF Pages para web
   - Opción B: un solo server (API sirve estáticos) — opcional

---

## 6) Validación que debes ejecutar tú (Codex)
Al terminar, ejecuta y asegúrate que pasa:
- `pnpm -v` (si aplica)
- `pnpm install`
- `pnpm lint`
- `pnpm test`
- `pnpm dev` y prueba con:
  - abrir `http://localhost:5173/?cid=TEST123`
  - submit formulario (debe registrar eventos en BD)
  - abrir `http://localhost:5173/admin` y ver datos

Documenta en el README cómo hacer estas pruebas.

---

## 7) Variables de entorno

### apps/api/.env
- `PORT=4000`
- `DATABASE_URL="file:./dev.db"`
- `WEB_ORIGIN="http://localhost:5173"`
- `ADMIN_USER="admin"`
- `ADMIN_PASS="changeme"`

Opcional ManyChat:
- `MANYCHAT_API_TOKEN=""`
- `MANYCHAT_TAG_NAME="Uso_Equivalentes"`
- `MANYCHAT_CUSTOM_FIELD_NAME="last_equivalentes_use"`
- `MANYCHAT_ENABLED="false"`

### apps/web/.env
- `VITE_API_URL="http://localhost:4000"`

---

## 8) Notas y supuestos
- No guardes datos sensibles de salud por defecto en `meta`.
- Si el usuario no trae `cid`, no permitas usar la herramienta.
- Todo debe quedar suficientemente modular para que yo cambie el algoritmo de equivalentes después.

---

## 9) Ahora sí: ejecuta
1) Crea el monorepo con pnpm.
2) Implementa backend + Prisma + migraciones.
3) Implementa frontend + UI.
4) Implementa dashboard.
5) Lint + tests.
6) README.

Entrega el resultado final como un repo funcional.

