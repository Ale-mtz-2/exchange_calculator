import type { TrackingAttribution, TrackingIdentityMode, TrackingSource } from '@equivalentes/shared';

const GUEST_CID_STORAGE_KEY = 'equivalentes_guest_cid';
const ATTRIBUTION_SESSION_PREFIX = 'equivalentes_attribution:';
const DEFAULT_UTM_SOURCE = 'sin_fuente';
const DEFAULT_UTM_MEDIUM = 'sin_medio';
const DEFAULT_UTM_CAMPAIGN = 'sin_campana';

const randomToken = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }

  return Math.random().toString(36).slice(2, 14);
};

const generateGuestCid = (): string => `guest_${randomToken()}`;

const normalizeCid = (value: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const normalizeAttributionValue = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const toCampaignKey = (utmCampaign: string, mcMsgId?: string): string =>
  `${utmCampaign}|${mcMsgId ?? ''}`;

const parseAttributionFromQuery = (search: string): TrackingAttribution => {
  const params = new URLSearchParams(search);

  const utmSource = normalizeAttributionValue(params.get('utm_source')) ?? DEFAULT_UTM_SOURCE;
  const utmMedium = normalizeAttributionValue(params.get('utm_medium')) ?? DEFAULT_UTM_MEDIUM;
  const utmCampaign = normalizeAttributionValue(params.get('utm_campaign')) ?? DEFAULT_UTM_CAMPAIGN;
  const utmContent = normalizeAttributionValue(params.get('utm_content'));
  const mcMsgId = normalizeAttributionValue(params.get('mc_msg_id'));

  return {
    utmSource,
    utmMedium,
    utmCampaign,
    ...(utmContent ? { utmContent } : {}),
    ...(mcMsgId ? { mcMsgId } : {}),
    campaignKey: toCampaignKey(utmCampaign, mcMsgId),
  };
};

const attributionSessionKey = (cid: string): string => `${ATTRIBUTION_SESSION_PREFIX}${cid}`;

const persistAttribution = (cid: string, attribution: TrackingAttribution): void => {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(attributionSessionKey(cid), JSON.stringify(attribution));
  } catch {
    // Ignore storage failures and continue with in-memory attribution.
  }
};

const readPersistedAttribution = (cid: string): TrackingAttribution | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(attributionSessionKey(cid));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<TrackingAttribution>;
    const utmCampaign = normalizeAttributionValue(parsed.utmCampaign) ?? DEFAULT_UTM_CAMPAIGN;
    const utmContent = normalizeAttributionValue(parsed.utmContent);
    const mcMsgId = normalizeAttributionValue(parsed.mcMsgId);

    return {
      utmSource: normalizeAttributionValue(parsed.utmSource) ?? DEFAULT_UTM_SOURCE,
      utmMedium: normalizeAttributionValue(parsed.utmMedium) ?? DEFAULT_UTM_MEDIUM,
      utmCampaign,
      ...(utmContent ? { utmContent } : {}),
      ...(mcMsgId ? { mcMsgId } : {}),
      campaignKey: toCampaignKey(utmCampaign, mcMsgId),
    };
  } catch {
    return null;
  }
};

export type ResolvedTrackingIdentity = {
  cid: string;
  source: TrackingSource;
  identityMode: TrackingIdentityMode;
  isGuest: boolean;
  manychatEligible: boolean;
  attribution: TrackingAttribution;
};

export const resolveTrackingIdentity = (search: string): ResolvedTrackingIdentity => {
  const queryCid = normalizeCid(new URLSearchParams(search).get('cid'));
  const queryAttribution = parseAttributionFromQuery(search);

  if (queryCid) {
    const persistedAttribution = readPersistedAttribution(queryCid);
    const hasCampaignInQuery = queryAttribution.utmCampaign !== DEFAULT_UTM_CAMPAIGN;
    const resolvedAttribution = hasCampaignInQuery
      ? queryAttribution
      : persistedAttribution ?? queryAttribution;

    persistAttribution(queryCid, resolvedAttribution);

    return {
      cid: queryCid,
      source: 'whatsapp',
      identityMode: 'query_cid',
      isGuest: false,
      manychatEligible: true,
      attribution: resolvedAttribution,
    };
  }

  let guestCid: string | null = null;

  if (typeof window !== 'undefined') {
    try {
      guestCid = normalizeCid(window.localStorage.getItem(GUEST_CID_STORAGE_KEY));
    } catch {
      guestCid = null;
    }
  }

  if (!guestCid || !guestCid.startsWith('guest_')) {
    guestCid = generateGuestCid();

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(GUEST_CID_STORAGE_KEY, guestCid);
      } catch {
        // Ignore storage failures and continue with in-memory guest id.
      }
    }
  }

  return {
    cid: guestCid,
    source: 'guest',
    identityMode: 'guest_localstorage',
    isGuest: true,
    manychatEligible: false,
    attribution: {
      utmSource: DEFAULT_UTM_SOURCE,
      utmMedium: DEFAULT_UTM_MEDIUM,
      utmCampaign: DEFAULT_UTM_CAMPAIGN,
      campaignKey: toCampaignKey(DEFAULT_UTM_CAMPAIGN),
    },
  };
};
