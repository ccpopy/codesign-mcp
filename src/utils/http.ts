// 用 page.evaluate 的方式发同源请求（带 cookies）。
// 单独抽出来便于复用和后续替换实现。

import type { Page } from 'playwright';

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
        return { status: 0, body: { error: (e as Error).message }, rawText: undefined };
      }
    },
    {
      url: req.url,
      method: req.method ?? 'GET',
      headers: req.headers ?? {},
      body: req.body,
    },
  );
  return result as SameOriginResponse<T>;
}
