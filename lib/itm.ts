import { createITMPartnerClient } from '@itm-studio/partner-sdk';

/**
 * Server-side ITM Partner client.
 * Only used in server components / route handlers.
 */
export function getITMClient() {
  const token = process.env.ITM_PARTNER_TOKEN;
  if (!token) {
    throw new Error(
      'Missing ITM_PARTNER_TOKEN env var. Get one from backstage: Settings > Partner API.',
    );
  }

  return createITMPartnerClient({
    token,
    baseUrl: process.env.ITM_API_URL,
  });
}

export function getBrandSubdomain(): string {
  const subdomain = process.env.ITM_BRAND_SUBDOMAIN;
  if (!subdomain) {
    throw new Error(
      'Missing ITM_BRAND_SUBDOMAIN env var. Set it to your brand subdomain (e.g., "npcc").',
    );
  }
  return subdomain;
}

export function getEmbedDomain(): string {
  return process.env.ITM_EMBED_DOMAIN || 'itm.studio';
}
