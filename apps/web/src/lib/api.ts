import type {
  CreateEventInput,
  EquivalentPlanResponseV2,
  GeneratePlanInput,
  KcalFormulaId,
  PatientProfile,
} from '@equivalentes/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  headers?: Record<string, string>;
};

const request = async <T>(path: string, options?: RequestOptions): Promise<T> => {
  const requestInit: RequestInit = {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  };

  if (options?.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, requestInit);

  if (!response.ok) {
    const text = await response.text();
    let parsedError: string | null = null;

    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) {
        parsedError = parsed.error;
      }
    } catch {
      // no-op: fallback to raw text below
    }

    if (parsedError) {
      throw new Error(parsedError);
    }

    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
};

export type ExchangeGroupOption = {
  id: string;
  groupCode: string;
  displayNameEs: string;
  choG: number;
  proG: number;
  fatG: number;
  kcalTarget: number;
};

export type ExchangeSubgroupOption = {
  id: string;
  parentGroupCode: string;
  subgroupCode: string;
  displayNameEs: string;
  choG: number;
  proG: number;
  fatG: number;
  kcalTarget: number;
  sortOrder: number;
};

export type AppOptions = {
  countries: { code: string; name: string }[];
  statesByCountry: Record<string, { code: string; name: string }[]>;
  formulas: { id: KcalFormulaId; name: string; description: string }[];
  systems: { id: string; countryCode: string; name: string }[];
  groupsBySystem: Record<string, ExchangeGroupOption[]>;
  subgroupsBySystem?: Record<string, ExchangeSubgroupOption[]>;
  subgroupPoliciesBySystem?: Record<string, unknown[]>;
};

/* Admin response types */

export type AdminSummary = {
  uniqueCids: number;
  totals: { open: number; generate: number; export: number };
  eventsByDay: { date: string; open: number; generate: number; export: number; total: number }[];
  usageByCountry: { countryCode: string; total: number }[];
  usageBySystem: { systemId: string; total: number }[];
  usageByFormula: { formulaId: string; total: number }[];
  usageBySource: { source: string; total: number }[];
  rangeDays: number;
};

type ContactSummary = {
  cid: string;
  source: string;
  firstSeen: string;
  lastSeen: string;
  totalEvents: number;
};

export type AdminContactsResponse = {
  contacts: ContactSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminContactDetailResponse = {
  cid: string;
  source: string;
  events: { id: number; eventType: string; createdAt: string; meta: unknown }[];
  plans: { id: number; createdAt: string; systemId: string; formulaId: string; countryCode: string }[];
};

type CampaignRow = {
  utmCampaign: string;
  mcMsgId: string | null;
  contacts: number;
  firstSeen: string;
  lastSeen: string;
};

export type AdminCampaignsResponse = {
  campaigns: CampaignRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminCampaignContactsResponse = {
  contacts: { cid: string; source: string; firstSeen: string; lastSeen: string; events: number }[];
  total: number;
  page: number;
  pageSize: number;
};

export const getOptions = (): Promise<AppOptions> => request('/api/options');

export const postEvent = (payload: CreateEventInput): Promise<{ ok: boolean }> =>
  request('/api/events', { method: 'POST', body: payload });

export const generatePlan = async (
  cid: string,
  profile: PatientProfile,
): Promise<EquivalentPlanResponseV2> => {
  const payload: GeneratePlanInput = { cid, profile };
  const response = await request<{ ok: boolean; data: EquivalentPlanResponseV2 }>('/api/plans/generate', {
    method: 'POST',
    body: payload,
  });
  return response.data;
};

const toAuthHeader = (user: string, pass: string): string => `Basic ${btoa(`${user}:${pass}`)}`;

export const getAdminSummary = (user: string, pass: string): Promise<AdminSummary> =>
  request('/api/admin/summary', { headers: { Authorization: toAuthHeader(user, pass) } });

export const getAdminContacts = (
  user: string,
  pass: string,
  page: number,
  pageSize: number,
  source: 'all' | 'whatsapp' | 'guest' = 'all',
): Promise<AdminContactsResponse> =>
  request(`/api/admin/contacts?page=${page}&pageSize=${pageSize}&source=${source}`, {
    headers: { Authorization: toAuthHeader(user, pass) },
  });

export const getAdminContactDetail = (user: string, pass: string, cid: string): Promise<AdminContactDetailResponse> =>
  request(`/api/admin/contacts/${encodeURIComponent(cid)}`, {
    headers: { Authorization: toAuthHeader(user, pass) },
  });

export const getAdminCampaigns = (
  user: string,
  pass: string,
  page: number,
  pageSize: number,
  days: number,
): Promise<AdminCampaignsResponse> =>
  request(`/api/admin/campaigns?page=${page}&pageSize=${pageSize}&days=${days}`, {
    headers: { Authorization: toAuthHeader(user, pass) },
  });

export const getAdminCampaignContacts = (
  user: string,
  pass: string,
  utmCampaign: string,
  mcMsgId: string | null,
  page: number,
  pageSize: number,
): Promise<AdminCampaignContactsResponse> =>
  request(
    `/api/admin/campaigns/contacts?utmCampaign=${encodeURIComponent(utmCampaign)}&mcMsgId=${encodeURIComponent(mcMsgId ?? '')}&page=${page}&pageSize=${pageSize}`,
    {
      headers: { Authorization: toAuthHeader(user, pass) },
    },
  );

export type LeadInput = {
  cid?: string | undefined;
  name: string;
  email?: string | undefined;
  whatsapp?: string | undefined;
  birthDate?: string | null;
  waistCm?: number | null;
  hasDiabetes?: boolean;
  hasHypertension?: boolean;
  hasDyslipidemia?: boolean;
  trainingWindow?: PatientProfile['trainingWindow'];
  usesDairyInSnacks?: boolean;
  planningFocus?: PatientProfile['planningFocus'];
  termsAccepted: boolean;
};

export const saveLead = (payload: LeadInput): Promise<{ id: string }> =>
  request('/api/leads', { method: 'POST', body: payload });

export type LeadByCidPayload = {
  id: string;
  cid: string | null;
  fullName: string;
  email: string | null;
  whatsapp: string | null;
  birthDate: string | null;
  waistCm: number | null;
  hasDiabetes: boolean;
  hasHypertension: boolean;
  hasDyslipidemia: boolean;
  trainingWindow: PatientProfile['trainingWindow'];
  usesDairyInSnacks: boolean;
  planningFocus: PatientProfile['planningFocus'];
  termsAccepted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpsertLeadByCidInput = {
  fullName?: string;
  email?: string | undefined;
  whatsapp?: string | undefined;
  birthDate?: string | null;
  waistCm?: number | null;
  hasDiabetes?: boolean;
  hasHypertension?: boolean;
  hasDyslipidemia?: boolean;
  trainingWindow?: PatientProfile['trainingWindow'];
  usesDairyInSnacks?: boolean;
  planningFocus?: PatientProfile['planningFocus'];
  termsAccepted?: boolean;
};

export const getLeadByCid = (cid: string): Promise<LeadByCidPayload> =>
  request(`/api/leads/by-cid/${encodeURIComponent(cid)}`);

export const upsertLeadByCid = (
  cid: string,
  payload: UpsertLeadByCidInput,
): Promise<LeadByCidPayload> =>
  request(`/api/leads/by-cid/${encodeURIComponent(cid)}`, {
    method: 'PUT',
    body: payload,
  });
