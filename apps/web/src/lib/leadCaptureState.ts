type LeadCaptureStatus = 'completed' | 'dismissed';

const LEAD_CAPTURE_STORAGE_PREFIX = 'equivalentes_lead_capture_status:';

const resolveStorageKey = (cid: string): string | null => {
  const normalized = cid.trim();
  if (!normalized) return null;
  return `${LEAD_CAPTURE_STORAGE_PREFIX}${normalized}`;
};

const readLeadCaptureStatus = (cid: string): LeadCaptureStatus | null => {
  if (typeof window === 'undefined') return null;

  const key = resolveStorageKey(cid);
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (raw === 'completed' || raw === 'dismissed') return raw;
    return null;
  } catch {
    return null;
  }
};

const writeLeadCaptureStatus = (cid: string, status: LeadCaptureStatus): void => {
  if (typeof window === 'undefined') return;

  const key = resolveStorageKey(cid);
  if (!key) return;

  try {
    window.localStorage.setItem(key, status);
  } catch {
    // Ignore storage failures to keep lead capture flow non-blocking.
  }
};

export const hasLeadPromptBeenHandled = (cid: string): boolean => readLeadCaptureStatus(cid) !== null;

export const markLeadPromptCompleted = (cid: string): void => {
  writeLeadCaptureStatus(cid, 'completed');
};

export const markLeadPromptDismissed = (cid: string): void => {
  writeLeadCaptureStatus(cid, 'dismissed');
};
