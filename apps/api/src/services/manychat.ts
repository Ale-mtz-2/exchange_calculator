import { env, isManyChatEnabled } from '../config/env.js';

type ManyChatSyncResult = {
  enabled: boolean;
  tagApplied: boolean;
  fieldSet: boolean;
  campaignFieldSet?: boolean;
  error?: string;
};

type ManyChatGenerateContext = {
  utmCampaign?: string;
};

const manychatRequest = async (path: string, payload: Record<string, unknown>): Promise<void> => {
  const response = await fetch(`https://api.manychat.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MANYCHAT_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ManyChat ${path} failed: ${response.status} ${text}`);
  }
};

export const syncManyChatOnGenerate = async (
  cid: string,
  timestampIso: string,
  context?: ManyChatGenerateContext,
): Promise<ManyChatSyncResult> => {
  if (!isManyChatEnabled) {
    return {
      enabled: false,
      tagApplied: false,
      fieldSet: false,
    };
  }

  try {
    // Fire tag and field requests in parallel for better latency
    await Promise.all([
      manychatRequest('/fb/subscriber/addTagByName', {
        subscriber_id: cid,
        tag_name: env.MANYCHAT_TAG_NAME,
      }),
      manychatRequest('/fb/subscriber/setCustomFieldByName', {
        subscriber_id: cid,
        field_name: env.MANYCHAT_CUSTOM_FIELD_NAME,
        field_value: timestampIso,
      }),
    ]);

    let campaignFieldSet = false;
    if (env.MANYCHAT_CUSTOM_FIELD_CAMPAIGN?.trim() && context?.utmCampaign) {
      await manychatRequest('/fb/subscriber/setCustomFieldByName', {
        subscriber_id: cid,
        field_name: env.MANYCHAT_CUSTOM_FIELD_CAMPAIGN,
        field_value: context.utmCampaign,
      });
      campaignFieldSet = true;
    }

    return {
      enabled: true,
      tagApplied: true,
      fieldSet: true,
      campaignFieldSet,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ManyChat error';
    console.error('[manychat-sync]', { cid, error: message });

    return {
      enabled: true,
      tagApplied: false,
      fieldSet: false,
      error: message,
    };
  }
};
