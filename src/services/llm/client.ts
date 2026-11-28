const LOOPBACK_URL_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i;

export const NARAROUTER_BASE_URL = 'https://router.bynara.id/v1';
export const NARAROUTER_DEFAULT_CHAT_MODEL = 'gpt-5.6-luna';
export const NARAROUTER_FALLBACK_MODELS = ['gpt-5.6-luna', 'qwen3.8-flash', 'glm-5.3-flash', 'mimo-v2.6-flash', 'deepseek-v4.1-flash'] as const;

function extractHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Checks whether a base URL targets a local loopback address unreachable from Vercel.
 */
export function isLoopbackLlmUrl(baseUrl: string): boolean {
  return LOOPBACK_URL_RE.test((baseUrl || '').trim());
}

/**
 * Checks whether an API key or base URL targets the NaraRouter gateway (`router.bynara.id`).
 */
export function isNaraRouterEndpoint(apiKey: string, baseUrl: string): boolean {
  const cleanKey = (apiKey || '').trim();
  const host = extractHostname((baseUrl || '').trim());
  return cleanKey.startsWith('sk-nry-') || host === 'router.bynara.id' || host.endsWith('.bynara.id');
}

/**
 * Checks whether an OpenAI-compatible router endpoint has credentials and is reachable from the current runtime.
 */
export function isLlmEndpointConfigured(apiKey: string, baseUrl: string): boolean {
  const cleanKey = (apiKey || '').trim();
  const cleanUrl = (baseUrl || '').trim();
  if (!cleanKey || !cleanUrl) return false;
  if (process.env.VERCEL && isLoopbackLlmUrl(cleanUrl)) {
    return false;
  }
  return true;
}

/**
 * Returns the ordered list of chat models to try for the active OpenAI-compatible router.
 */
export function resolveChatFallbackModels(
  primaryModel: string,
  apiKey: string,
  baseUrl: string
): string[] {
  if (process.env.VERCEL) {
    return [primaryModel].filter(Boolean);
  }
  const fallbacks = isNaraRouterEndpoint(apiKey, baseUrl)
    ? NARAROUTER_FALLBACK_MODELS
    : ['free-router'];
  return Array.from(new Set([primaryModel, ...fallbacks].filter(Boolean)));
}

/**
 * Normalizes an OpenAI-compatible base URL (with or without `/v1`) and appends the target route.
 */
export function resolveLlmEndpoint(baseUrl: string, routePath: string): string {
  const normalized = (baseUrl || '').trim().replace(/\/+$/, '');
  const cleanRoute = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return normalized.endsWith('/v1')
    ? `${normalized}${cleanRoute}`
    : `${normalized}/v1${cleanRoute}`;
}
