import type { IExecuteFunctions, IWebhookFunctions } from 'n8n-workflow';

/**
 * Konteks helper untuk fungsi execute dan webhook.
 */
type Ctx = IExecuteFunctions | IWebhookFunctions;

/**
 * Membangun URL penuh dari base URL kredensial dan path.
 */
export async function buildUrl(ctx: Ctx, path: string): Promise<string> {
  const credentials = (await (ctx as any).getCredentials('mayarApi')) as { apiKey: string; baseUrl?: string };
  const base = credentials.baseUrl || 'https://api.mayar.id/hl/v1';
  const cleanBase = base.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${cleanBase}/${cleanPath}`;
}

/**
 * Melakukan HTTP request dengan mekanisme retry opsional.
 */
export async function request(
  ctx: Ctx,
  options: {
    method: string;
    path: string;
    json?: boolean;
    body?: any;
    qs?: any;
    headers?: Record<string, string>;
    retry?: { maxRetries?: number; retryDelayMs?: number; retryOn?: number[] };
  },
) {
  const credentials = (await (ctx as any).getCredentials('mayarApi')) as { apiKey: string; baseUrl?: string };
  const url = await buildUrl(ctx, options.path);
  const headers = { Authorization: `Bearer ${credentials.apiKey}`, ...(options.headers || {}) };

  const maxRetries = options.retry?.maxRetries ?? 0;
  const retryDelayMs = options.retry?.retryDelayMs ?? 500;
  const retryOn = options.retry?.retryOn ?? [429, 500, 502, 503, 504];

  let attempt = 0;
  while (true) {
    try {
      const reqAuth = (ctx as any).helpers.requestWithAuthentication;
      const res = await reqAuth.call(ctx, 'mayarApi', { method: options.method, url, json: options.json ?? true, body: options.body, qs: options.qs, headers });
      return res;
    } catch (error: any) {
      const statusCode = error?.statusCode ?? error?.status ?? 500;
      const shouldRetry = retryOn.includes(statusCode) && attempt < maxRetries;
      if (!shouldRetry) {
        throw error;
      }
      attempt += 1;
      await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
    }
  }
}