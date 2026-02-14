# Recomendaciones de Hospedaje (Hosting)

Analizando tu repositorio (Monorepo con React/Vite en frontend, Express/Prisma en backend y PostgreSQL), aquí tienes las mejores opciones baratas o gratuitas.

## Resumen de la Arquitectura
*   **Frontend (`apps/web`):** Single Page Application (SPA) con React y Vite.
*   **Backend (`apps/api`):** Servidor Node.js con Express.
*   **Base de Datos:** PostgreSQL (requerido por Prisma).
*   **Estructura:** Monorepo gestionado con PNPM.

---

## Opción 1: "Totalmente Gratis" (Ideal para Demos/Portafolio)
Esta combinación aprovecha los niveles gratuitos de diferentes proveedores.

### 1. Frontend: [Vercel](https://vercel.com) (Gratis)
*   **Por qué:** Es el estándar de oro para apps React/Vite. Despliegue automático desde GitHub.
*   **Configuración:** Detectará automáticamente `apps/web`. Solo necesitas configurar el comando de build (`cd ../.. && pnpm build` o similar, Vercel tiene soporte para monorepos).
*   **Costo:** $0/mes.

### 2. Base de Datos: [Supabase](https://supabase.com) o [Neon](https://neon.tech) (Gratis)
*   **Por qué:** Ambos ofrecen PostgreSQL gestionado gratuito y generoso.
*   **Supabase:** 500MB de base de datos gratis.
*   **Neon:** Interesante porque "escala a cero" (se apaga si no se usa), ideal para desarrollo.
*   **Costo:** $0/mes.

### 3. Backend: [Render](https://render.com) (Gratis)
*   **Por qué:** Permite subir tu servicio Node.js (`apps/api`).
*   **Limitación importante:** En el plan gratuito, el servidor "se duerme" tras 15 minutos de inactividad. La primera petición tardará unos 30-50 segundos en despertar.
*   **Costo:** $0/mes.

---

## Opción 2: Económica y Profesional (Recomendada para Producción)
Si planeas que usuarios reales usen la app, evita que el servidor se duerma.

### 1. Frontend: Vercel (Gratis)
Igual que arriba. El plan Hobby es suficiente para proyectos personales serios.

### 2. Base de Datos: Supabase (Gratis)
El plan gratuito de Supabase suele aguantar bastante tráfico moderado.

### 3. Backend: [Railway](https://railway.app) o [Render (Starter)](https://render.com)
*   **Railway:** Muy fácil de configurar con monorepos. Te cobran por uso de CPU/RAM.
    *   **Costo:** ~$5 USD/mes (créditos).
*   **Render (Plan Starter):** Mantiene el servidor activo 24/7.
    *   **Costo:** $7 USD/mes.

---

## Pasos para desplegar (Guía Rápida)

### Paso 1: Base de Datos (Supabase)
1.  Crea cuenta en Supabase.
2.  Crea un nuevo proyecto.
3.  Obtén la `connection string` (DATABASE_URL) en Transaction Mode (puerto 6543) o Session Mode (5432). Para Prisma, suele recomendarse Session Mode o usar PgBouncer.
4.  Copia esa URL.

### Paso 2: Backend (Render Ejemplo Gratis)
1.  Crea cuenta en Render.
2.  "New Web Service" -> Conecta tu repo de GitHub.
3.  **Root Directory:** `apps/api`
4.  **Build Command:** `pnpm install && pnpm build` (Tendrás que asegurar que instale las dependencias del monorepo, a veces requiere configuración extra en Render para monorepos, o usar un Dockerfile simple).
5.  **Start Command:** `item start` (o `node dist/index.js`).
6.  **Variables de Entorno:** Añade `DATABASE_URL` (la de Supabase) y otras del `.env`.

### Paso 3: Frontend (Vercel)
1.  Crea cuenta en Vercel.
2.  "Add New Project" -> Importa tu repo.
3.  **Root Directory:** `apps/web`.
4.  **Build Command:** Vercel suele detectar `vite build`.
5.  **Variables de Entorno:** Añade `VITE_API_URL` apuntando a la URL que te dio Render (ej: `https://mi-api.onrender.com`).

---

## Recomendación de Antigravity
Para empezar sin gastar ni un centavo pero con buena calidad:
1.  **DB:** Supabase (Postgres).
2.  **Frontend:** Vercel.
3.  **Backend:** Render (Free Tier).

Si el "despertar" lento del backend molesta a tus usuarios, paga los $7 USD de Render o múdate a Railway por ~$5 USD.
