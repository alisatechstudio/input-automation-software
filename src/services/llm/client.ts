const LOOPBACK_URL_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i;

/**
 * Checks whether an OpenAI-compatible router endpoint has credentials and is reachable from the current runtime.
 */
export function isLlmEndpointConfigured(apiKey: string, baseUrl: string): boolean {
  const cleanKey = (apiKey || '').trim();
  const cleanUrl = (baseUrl || '').trim();
  if (!cleanKey || !cleanUrl) return false;
  if (process.env.VERCEL && LOOPBACK_URL_RE.test(cleanUrl)) {
    return false;
  }
  return true;
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
