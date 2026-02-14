import { Router } from 'express';

import { adminPaginationSchema } from '@equivalentes/shared';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { safeSchema } from '../utils/sql.js';

const appSchema = safeSchema(env.DB_APP_SCHEMA);

const sourceExpr = (alias: string): string =>
  `COALESCE(${alias}.meta->>'source', CASE WHEN ${alias}.cid LIKE 'guest_%' THEN 'guest' ELSE 'whatsapp' END)`;
const utmCampaignExpr = (alias: string): string =>
  `COALESCE(NULLIF(${alias}.meta->>'utmCampaign', ''), 'sin_campana')`;
const mcMsgIdExpr = (alias: string): string => `NULLIF(${alias}.meta->>'mcMsgId', '')`;

const parsePositiveInt = (raw: unknown, fallback: number, maxValue: number): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.trunc(parsed);
  if (integer < 1) return fallback;
  return Math.min(integer, maxValue);
};

export const adminRouter = Router();

adminRouter.get('/summary', async (_req, res, next) => {
  try {
    const [
      uniqueResult,
      totalsResult,
      timelineResult,
      countryUsageResult,
      systemUsageResult,
      formulaUsageResult,
      sourceUsageResult,
    ] = await Promise.all([
      nutritionPool.query<{ total: string }>(
        `SELECT COUNT(DISTINCT cid)::text AS total FROM ${appSchema}.tracking_events;`,
      ),
      nutritionPool.query<{ event_type: string; total: string }>(
        `SELECT event_type, COUNT(*)::text AS total FROM ${appSchema}.tracking_events GROUP BY event_type;`,
      ),
      nutritionPool.query<{
        date: string;
        open_count: string;
        generate_count: string;
        export_count: string;
        total_count: string;
      }>(`
        WITH days AS (
          SELECT generate_series(current_date - interval '13 day', current_date, interval '1 day')::date AS day
        )
        SELECT
          to_char(d.day, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(CASE WHEN e.event_type = 'open' THEN 1 ELSE 0 END), 0)::text AS open_count,
          COALESCE(SUM(CASE WHEN e.event_type = 'generate' THEN 1 ELSE 0 END), 0)::text AS generate_count,
          COALESCE(SUM(CASE WHEN e.event_type = 'export' THEN 1 ELSE 0 END), 0)::text AS export_count,
          COALESCE(COUNT(e.id), 0)::text AS total_count
        FROM days d
        LEFT JOIN ${appSchema}.tracking_events e ON e.created_at::date = d.day
        GROUP BY d.day
        ORDER BY d.day;
      `),
      nutritionPool.query<{ country_code: string; total: string }>(
        `SELECT country_code, COUNT(*)::text AS total FROM ${appSchema}.generated_plans GROUP BY country_code ORDER BY total DESC;`,
      ),
      nutritionPool.query<{ system_id: string; total: string }>(
        `SELECT system_id, COUNT(*)::text AS total FROM ${appSchema}.generated_plans GROUP BY system_id ORDER BY total DESC;`,
      ),
      nutritionPool.query<{ formula_id: string; total: string }>(
        `SELECT formula_id, COUNT(*)::text AS total FROM ${appSchema}.generated_plans GROUP BY formula_id ORDER BY total DESC;`,
      ),
      nutritionPool.query<{ source: string; total: string }>(`
        SELECT ${sourceExpr('e')} AS source, COUNT(*)::text AS total
        FROM ${appSchema}.tracking_events e
        GROUP BY source
        ORDER BY total DESC;
      `),
    ]);

    const totals = {
      open: 0,
      generate: 0,
      export: 0,
    };

    for (const row of totalsResult.rows) {
      const key = row.event_type as keyof typeof totals;
      if (key in totals) totals[key] = Number(row.total);
    }

    res.json({
      uniqueCids: Number(uniqueResult.rows[0]?.total ?? 0),
      totals,
      eventsByDay: timelineResult.rows.map((row: {
        date: string;
        open_count: string;
        generate_count: string;
        export_count: string;
        total_count: string;
      }) => ({
        date: row.date,
        open: Number(row.open_count),
        generate: Number(row.generate_count),
        export: Number(row.export_count),
        total: Number(row.total_count),
      })),
      usageByCountry: countryUsageResult.rows.map((row: { country_code: string; total: string }) => ({
        countryCode: row.country_code,
        total: Number(row.total),
      })),
      usageBySystem: systemUsageResult.rows.map((row: { system_id: string; total: string }) => ({
        systemId: row.system_id,
        total: Number(row.total),
      })),
      usageByFormula: formulaUsageResult.rows.map((row: { formula_id: string; total: string }) => ({
        formulaId: row.formula_id,
        total: Number(row.total),
      })),
      usageBySource: sourceUsageResult.rows.map((row: { source: string; total: string }) => ({
        source: row.source,
        total: Number(row.total),
      })),
      rangeDays: 14,
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/contacts', async (req, res, next) => {
  try {
    const parsed = adminPaginationSchema.parse(req.query);
    const offset = (parsed.page - 1) * parsed.pageSize;

    const searchPattern = parsed.search?.trim() ? `%${parsed.search.trim()}%` : null;
    const sourceFilter = parsed.source === 'all' ? null : parsed.source;

    const listSql = `
      WITH contact_base AS (
        SELECT
          e.cid,
          MIN(e.created_at) AS first_seen,
          MAX(e.created_at) AS last_seen,
          SUM(CASE WHEN e.event_type = 'open' THEN 1 ELSE 0 END)::int AS open_count,
          SUM(CASE WHEN e.event_type = 'generate' THEN 1 ELSE 0 END)::int AS generate_count,
          SUM(CASE WHEN e.event_type = 'export' THEN 1 ELSE 0 END)::int AS export_count,
          (ARRAY_AGG(${sourceExpr('e')} ORDER BY e.created_at DESC))[1] AS source
        FROM ${appSchema}.tracking_events e
        WHERE ($1::text IS NULL OR e.cid ILIKE $1)
        GROUP BY e.cid
      )
      SELECT
        cid,
        first_seen,
        last_seen,
        open_count,
        generate_count,
        export_count,
        source
      FROM contact_base
      WHERE ($2::text IS NULL OR source = $2)
      ORDER BY last_seen DESC
      LIMIT $3 OFFSET $4;
    `;

    const totalSql = `
      WITH contact_base AS (
        SELECT
          e.cid,
          (ARRAY_AGG(${sourceExpr('e')} ORDER BY e.created_at DESC))[1] AS source
        FROM ${appSchema}.tracking_events e
        WHERE ($1::text IS NULL OR e.cid ILIKE $1)
        GROUP BY e.cid
      )
      SELECT COUNT(*)::int AS total
      FROM contact_base
      WHERE ($2::text IS NULL OR source = $2);
    `;

    const [itemsResult, totalResult] = await Promise.all([
      nutritionPool.query<{
        cid: string;
        first_seen: string;
        last_seen: string;
        open_count: number;
        generate_count: number;
        export_count: number;
        source: string;
      }>(listSql, [searchPattern, sourceFilter, parsed.pageSize, offset]),
      nutritionPool.query<{ total: number }>(totalSql, [searchPattern, sourceFilter]),
    ]);

    res.json({
      page: parsed.page,
      pageSize: parsed.pageSize,
      source: parsed.source,
      total: totalResult.rows[0]?.total ?? 0,
      items: itemsResult.rows.map((row: {
        cid: string;
        first_seen: string;
        last_seen: string;
        open_count: number;
        generate_count: number;
        export_count: number;
        source: string;
      }) => ({
        cid: row.cid,
        source: row.source,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        openCount: Number(row.open_count),
        generateCount: Number(row.generate_count),
        exportCount: Number(row.export_count),
      })),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/campaigns', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const days = parsePositiveInt(req.query.days, 30, 365);
    const offset = (page - 1) * pageSize;

    const baseWhere = `
      ${sourceExpr('e')} = 'whatsapp'
      AND e.created_at >= now() - (($1::int - 1) * interval '1 day')
    `;

    const listSql = `
      WITH campaign_rows AS (
        SELECT
          ${utmCampaignExpr('e')} AS utm_campaign,
          ${mcMsgIdExpr('e')} AS mc_msg_id,
          MIN(e.created_at) AS first_seen,
          MAX(e.created_at) AS last_seen,
          COUNT(*)::int AS total_events,
          SUM(CASE WHEN e.event_type = 'open' THEN 1 ELSE 0 END)::int AS open_events,
          SUM(CASE WHEN e.event_type = 'generate' THEN 1 ELSE 0 END)::int AS generate_events,
          SUM(CASE WHEN e.event_type = 'export' THEN 1 ELSE 0 END)::int AS export_events,
          COUNT(DISTINCT CASE WHEN e.event_type = 'open' THEN e.cid END)::int AS open_unique_cids,
          COUNT(DISTINCT CASE WHEN e.event_type = 'generate' THEN e.cid END)::int AS generate_unique_cids,
          COUNT(DISTINCT CASE WHEN e.event_type = 'export' THEN e.cid END)::int AS export_unique_cids
        FROM ${appSchema}.tracking_events e
        WHERE ${baseWhere}
        GROUP BY ${utmCampaignExpr('e')}, ${mcMsgIdExpr('e')}
      )
      SELECT
        utm_campaign,
        mc_msg_id,
        first_seen,
        last_seen,
        total_events,
        open_events,
        generate_events,
        export_events,
        open_unique_cids,
        generate_unique_cids,
        export_unique_cids
      FROM campaign_rows
      ORDER BY last_seen DESC
      LIMIT $2 OFFSET $3;
    `;

    const totalSql = `
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT 1
        FROM ${appSchema}.tracking_events e
        WHERE ${baseWhere}
        GROUP BY ${utmCampaignExpr('e')}, ${mcMsgIdExpr('e')}
      ) rows;
    `;

    const [itemsResult, totalResult] = await Promise.all([
      nutritionPool.query<{
        utm_campaign: string;
        mc_msg_id: string | null;
        first_seen: string;
        last_seen: string;
        total_events: number;
        open_events: number;
        generate_events: number;
        export_events: number;
        open_unique_cids: number;
        generate_unique_cids: number;
        export_unique_cids: number;
      }>(listSql, [days, pageSize, offset]),
      nutritionPool.query<{ total: number }>(totalSql, [days]),
    ]);

    res.json({
      page,
      pageSize,
      days,
      total: totalResult.rows[0]?.total ?? 0,
      items: itemsResult.rows.map((row) => ({
        utmCampaign: row.utm_campaign,
        mcMsgId: row.mc_msg_id ?? null,
        campaignKey: `${row.utm_campaign}|${row.mc_msg_id ?? ''}`,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        totalEvents: Number(row.total_events),
        openEvents: Number(row.open_events),
        generateEvents: Number(row.generate_events),
        exportEvents: Number(row.export_events),
        openUniqueCids: Number(row.open_unique_cids),
        generateUniqueCids: Number(row.generate_unique_cids),
        exportUniqueCids: Number(row.export_unique_cids),
        conversionGenerateOverOpen:
          Number(row.open_unique_cids) > 0
            ? Number(row.generate_unique_cids) / Number(row.open_unique_cids)
            : 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/campaigns/contacts', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const utmCampaignRaw = typeof req.query.utmCampaign === 'string' ? req.query.utmCampaign.trim() : '';
    const mcMsgIdRaw = typeof req.query.mcMsgId === 'string' ? req.query.mcMsgId.trim() : '';
    const utmCampaign = utmCampaignRaw || 'sin_campana';
    const mcMsgId = mcMsgIdRaw || null;
    const offset = (page - 1) * pageSize;

    const listSql = `
      WITH cid_rows AS (
        SELECT
          e.cid,
          MIN(e.created_at) AS first_seen,
          MAX(e.created_at) AS last_seen,
          SUM(CASE WHEN e.event_type = 'open' THEN 1 ELSE 0 END)::int AS open_count,
          SUM(CASE WHEN e.event_type = 'generate' THEN 1 ELSE 0 END)::int AS generate_count,
          SUM(CASE WHEN e.event_type = 'export' THEN 1 ELSE 0 END)::int AS export_count
        FROM ${appSchema}.tracking_events e
        WHERE ${sourceExpr('e')} = 'whatsapp'
          AND ${utmCampaignExpr('e')} = $1
          AND (
            ($2::text IS NULL AND ${mcMsgIdExpr('e')} IS NULL)
            OR ${mcMsgIdExpr('e')} = $2
          )
        GROUP BY e.cid
      )
      SELECT
        cid,
        first_seen,
        last_seen,
        open_count,
        generate_count,
        export_count
      FROM cid_rows
      ORDER BY last_seen DESC
      LIMIT $3 OFFSET $4;
    `;

    const totalSql = `
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT e.cid
        FROM ${appSchema}.tracking_events e
        WHERE ${sourceExpr('e')} = 'whatsapp'
          AND ${utmCampaignExpr('e')} = $1
          AND (
            ($2::text IS NULL AND ${mcMsgIdExpr('e')} IS NULL)
            OR ${mcMsgIdExpr('e')} = $2
          )
        GROUP BY e.cid
      ) rows;
    `;

    const [itemsResult, totalResult] = await Promise.all([
      nutritionPool.query<{
        cid: string;
        first_seen: string;
        last_seen: string;
        open_count: number;
        generate_count: number;
        export_count: number;
      }>(listSql, [utmCampaign, mcMsgId, pageSize, offset]),
      nutritionPool.query<{ total: number }>(totalSql, [utmCampaign, mcMsgId]),
    ]);

    res.json({
      page,
      pageSize,
      utmCampaign,
      mcMsgId,
      total: totalResult.rows[0]?.total ?? 0,
      items: itemsResult.rows.map((row) => ({
        cid: row.cid,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        openCount: Number(row.open_count),
        generateCount: Number(row.generate_count),
        exportCount: Number(row.export_count),
      })),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/contacts/:cid', async (req, res, next) => {
  try {
    const { cid } = req.params;

    const [eventsResult, statsResult] = await Promise.all([
      nutritionPool.query<{
        id: string;
        event_type: string;
        meta: unknown;
        user_agent: string | null;
        ip: string | null;
        created_at: string;
        source: string;
      }>(
        `
        SELECT
          e.id::text,
          e.event_type,
          e.meta,
          e.user_agent,
          e.ip::text,
          e.created_at::text,
          ${sourceExpr('e')} AS source
        FROM ${appSchema}.tracking_events e
        WHERE e.cid = $1
        ORDER BY e.created_at ASC;
        `,
        [cid],
      ),
      nutritionPool.query<{
        event_type: string;
        total: string;
      }>(
        `
        SELECT event_type, COUNT(*)::text AS total
        FROM ${appSchema}.tracking_events
        WHERE cid = $1
        GROUP BY event_type;
        `,
        [cid],
      ),
    ]);

    const stats = { open: 0, generate: 0, export: 0 };
    for (const row of statsResult.rows) {
      const key = row.event_type as keyof typeof stats;
      if (key in stats) stats[key] = Number(row.total);
    }

    const source =
      eventsResult.rows[eventsResult.rows.length - 1]?.source ??
      (cid.startsWith('guest_') ? 'guest' : 'whatsapp');

    res.json({
      cid,
      source,
      stats,
      events: eventsResult.rows.map((row: {
        id: string;
        event_type: string;
        meta: unknown;
        user_agent: string | null;
        ip: string | null;
        created_at: string;
        source: string;
      }) => ({
        id: row.id,
        event: row.event_type,
        source: row.source,
        meta: row.meta,
        userAgent: row.user_agent,
        ip: row.ip,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});
