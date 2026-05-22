// 用 Playwright BrowserContext 绑定的 APIRequestContext 发请求。
// 它复用浏览器上下文 cookie，避免在页面里动态执行 fetch。

import type { APIRequestContext } from 'playwright';
import { CodesignError } from '../codesign/errors.js';
import { config } from '../config.js';
import { assertCodesignOriginUrl } from './url.js';

export interface SameOriginRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
}

export interface SameOriginResponse<T = unknown> {
  status: number;
  body: T;
  rawText?: string;
}

export async function requestJson<T = unknown>(
  request: APIRequestContext,
  req: SameOriginRequest,
): Promise<SameOriginResponse<T>> {
  assertCodesignOriginUrl(req.url, 'same-origin request', config.origin);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(req.headers ?? {}),
  };
  if (req.body !== undefined) {
    headers['Content-Type'] = 'application/json;charset=UTF-8';
  }

  try {
    const response = await request.fetch(req.url, {
      method: req.method ?? 'GET',
      headers,
      data: req.body === undefined ? undefined : JSON.stringify(req.body),
      timeout: config.apiTimeoutMs,
    });
    const rawText = await response.text();
    return {
      status: response.status(),
      body: parseJsonBody(rawText) as T,
      rawText,
    };
  } catch (err) {
    throw new CodesignError('SHARING_FETCH_FAILED', `same-origin request failed: ${(err as Error).message}`, {
      url: req.url,
    });
  }
}

function parseJsonBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
