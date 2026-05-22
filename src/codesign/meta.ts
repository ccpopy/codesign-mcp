import { config } from '../config.js';
import { CodesignError } from './errors.js';
import { assertAllowedRemoteUrl, normalizeCodesignAssetUrl } from '../utils/url.js';

// CDN 资源在 HAR 中无 cookie 依赖，可直接 Node fetch。
// 加一个 User-Agent 避免被 CDN 防火墙误判。
const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (CodesignMcp/0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
};

export async function fetchMetaJson<T = unknown>(url: string): Promise<T> {
  if (!url || typeof url !== 'string') {
    throw new CodesignError('META_FETCH_FAILED', 'meta url is empty');
  }
  const remoteUrl = normalizeCodesignAssetUrl(url);
  assertAllowedRemoteUrl(remoteUrl, 'meta');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.metaTimeoutMs);
  try {
    const resp = await fetch(remoteUrl, { headers: DEFAULT_HEADERS, signal: controller.signal });
    if (!resp.ok) {
      throw new CodesignError('META_FETCH_FAILED', `meta fetch failed: HTTP ${resp.status}`, {
        url: remoteUrl,
        status: resp.status,
      });
    }
    const text = await resp.text();
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new CodesignError('META_SCHEMA_MISMATCH', 'meta body is not valid JSON', {
        url: remoteUrl,
        snippet: text.slice(0, 200),
        parseError: (err as Error).message,
      });
    }
  } catch (err) {
    if (err instanceof CodesignError) throw err;
    throw new CodesignError('META_FETCH_FAILED', `meta fetch threw: ${(err as Error).message}`, {
      url: remoteUrl,
    });
  } finally {
    clearTimeout(timer);
  }
}
