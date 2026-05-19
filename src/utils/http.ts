// 用 page.evaluate 的方式发同源请求（带 cookies）。
// 单独抽出来便于复用和后续替换实现。

import type { Page } from 'playwright';
import { CodesignError } from '../codesign/errors.js';

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

interface EvaluateResponse {
  status: number;
  body: unknown;
  rawText?: string;
  fetchError?: string;
}

export async function requestJson<T = unknown>(
  page: Page,
  req: SameOriginRequest,
): Promise<SameOriginResponse<T>> {
  const result = await page.evaluate(
    async ({ url, method, headers, body }) => {
      const init: RequestInit = {
        method: method ?? 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json', ...(headers ?? {}) },
      };
      if (body !== undefined) {
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json;charset=UTF-8';
        init.body = JSON.stringify(body);
      }
      try {
        const r = await fetch(url, init);
        const text = await r.text();
        let parsed: unknown;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = undefined;
        }
        return { status: r.status, body: parsed, rawText: text };
      } catch (e: unknown) {
        return {
          status: 0,
          body: null,
          rawText: undefined,
          fetchError: e instanceof Error ? e.message : String(e),
        };
      }
    },
    {
      url: req.url,
      method: req.method ?? 'GET',
      headers: req.headers ?? {},
      body: req.body,
    },
  ) as EvaluateResponse;
  if (result.fetchError) {
    throw new CodesignError('SHARING_FETCH_FAILED', `same-origin request failed: ${result.fetchError}`, {
      url: req.url,
    });
  }
  return result as SameOriginResponse<T>;
}
