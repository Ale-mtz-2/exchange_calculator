import { Prisma } from '@prisma/client';
import { Router } from 'express';

import { createEventSchema } from '@equivalentes/shared';
import type { TrackingIdentityMode, TrackingSource } from '@equivalentes/shared';

import { prisma } from '../db/prisma.js';
import { syncManyChatOnGenerate } from '../services/manychat.js';

const DEFAULT_UTM_SOURCE = 'sin_fuente';
const DEFAULT_UTM_MEDIUM = 'sin_medio';
const DEFAULT_UTM_CAMPAIGN = 'sin_campana';

const getRequestIp = (forwardedHeader: string | string[] | undefined, fallback?: string): string | null => {
  const value = Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader;
  if (value) {
    return value.split(',')[0]?.trim() ?? null;
  }

  return fallback ?? null;
};

const inferTrackingSource = (
  cid: string,
  meta: Record<string, unknown> | undefined,
): TrackingSource => {
  const source = meta?.source;
  if (source === 'whatsapp' || source === 'guest') {
    return source;
  }

  if (cid.startsWith('guest_')) {
    return 'guest';
  }

  return 'whatsapp';
};

const inferTrackingIdentityMode = (
  source: TrackingSource,
  meta: Record<string, unknown> | undefined,
): TrackingIdentityMode => {
  const identityMode = meta?.identityMode;
  if (identityMode === 'query_cid' || identityMode === 'guest_localstorage') {
    return identityMode;
  }

  return source === 'guest' ? 'guest_localstorage' : 'query_cid';
};

type NormalizedAttribution = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent?: string;
  mcMsgId?: string;
  campaignKey: string;
};

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
};

const parseAttribution = (meta: Record<string, unknown> | undefined): NormalizedAttribution => {
  const nested = (meta?.attribution ?? {}) as Record<string, unknown>;

  const utmSource = normalizeString(nested.utmSource ?? meta?.utmSource) ?? DEFAULT_UTM_SOURCE;
  const utmMedium = normalizeString(nested.utmMedium ?? meta?.utmMedium) ?? DEFAULT_UTM_MEDIUM;
  const utmCampaign = normalizeString(nested.utmCampaign ?? meta?.utmCampaign) ?? DEFAULT_UTM_CAMPAIGN;
  const utmContent = normalizeString(nested.utmContent ?? meta?.utmContent);
  const mcMsgId = normalizeString(nested.mcMsgId ?? meta?.mcMsgId);
  const campaignKey = `${utmCampaign}|${mcMsgId ?? ''}`;

  return {
    utmSource,
    utmMedium,
    utmCampaign,
    ...(utmContent ? { utmContent } : {}),
    ...(mcMsgId ? { mcMsgId } : {}),
    campaignKey,
  };
};

export const eventsRouter = Router();

eventsRouter.post('/', async (req, res, next) => {
  try {
    const payload = createEventSchema.parse(req.body);
    const source = inferTrackingSource(payload.cid, payload.meta);
    const identityMode = inferTrackingIdentityMode(source, payload.meta);
    const attribution = parseAttribution(payload.meta);
    const manychatEligible =
      payload.event === 'generate' && source === 'whatsapp' && !payload.cid.startsWith('guest_');
    const normalizedMeta: Record<string, unknown> = {
      ...(payload.meta ?? {}),
      source,
      identityMode,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmContent: attribution.utmContent ?? null,
      mcMsgId: attribution.mcMsgId ?? null,
      campaignKey: attribution.campaignKey,
      attribution,
      ...(payload.event === 'generate' ? { manychatEligible } : {}),
    };

    const created = await prisma.trackingEvent.create({
      data: {
        cid: payload.cid,
        eventType: payload.event,
        userAgent: req.get('user-agent') ?? null,
        ip: getRequestIp(req.headers['x-forwarded-for'], req.socket.remoteAddress),
        meta: normalizedMeta as Prisma.InputJsonValue,
      },
    });

    let manychat:
      | {
          enabled: boolean;
          tagApplied: boolean;
          fieldSet: boolean;
          campaignFieldSet?: boolean;
          error?: string;
        }
      | undefined;

    if (manychatEligible) {
      manychat = await syncManyChatOnGenerate(payload.cid, created.createdAt.toISOString(), {
        utmCampaign: attribution.utmCampaign,
      });
    }

    res.status(201).json({
      ok: true,
      id: created.id,
      createdAt: created.createdAt.toISOString(),
      manychat,
    });
  } catch (error) {
    next(error);
  }
});
