// 通过 CoDesign 同源上下文调 /api/user，判断登录态。
// 不在这里启动浏览器，调用方负责传入 page。

import type { Page } from 'playwright';
import { config } from '../config.js';
import { getLogger } from '../logger.js';

const log = getLogger();

export interface SessionProbe {
  loggedIn: boolean;
  status: number;
  user?: {
    id?: number | string;
    uuid?: string;
    has_password?: boolean;
  };
  raw?: unknown;
}

// 在已建立的浏览器上下文中调用 /api/user。
// BrowserContext.request 复用同一个上下文 cookie，不需要在页面里执行脚本。
export async function probeLoggedIn(page: Page): Promise<SessionProbe> {
  const currentUrl = page.url();
  if (!currentUrl.startsWith(config.origin)) {
    log.debug({ currentUrl }, 'navigating to home before probe');
    await page.goto(`${config.origin}${config.homePath}`, {
      waitUntil: 'domcontentloaded',
      timeout: config.navTimeoutMs,
    });
  }

  const r = await page.context().request.get(
    `${config.origin}/api/user?include=profiles&appends=is_company_admin,is_company_member,is_company_guest,has_password,watermark_settings`,
    {
      headers: { Accept: 'application/json' },
      timeout: config.apiTimeoutMs,
    },
  );
  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    /* ignore */
  }
  const resp = { status: r.status(), body };

  if (resp.status === 200 && resp.body && typeof resp.body === 'object') {
    const body = resp.body as Record<string, unknown>;
    return {
      loggedIn: true,
      status: 200,
      user: {
        id: body.id as number | string | undefined,
        uuid: body.uuid as string | undefined,
        has_password: body.has_password as boolean | undefined,
      },
      raw: undefined,
    };
  }
  return { loggedIn: false, status: resp.status, raw: resp.body };
}

// 在 headed 浏览器中等待用户扫码登录完成。
// 周期性 probe /api/user，直到 200 或超时。
export async function waitForLogin(
  page: Page,
  opts: { timeoutMs: number; pollMs?: number } = { timeoutMs: 10 * 60 * 1000 },
): Promise<SessionProbe> {
  const pollMs = opts.pollMs ?? 2000;
  const deadline = Date.now() + opts.timeoutMs;
  let last: SessionProbe = { loggedIn: false, status: 0 };
  while (Date.now() < deadline) {
    try {
      last = await probeLoggedIn(page);
      if (last.loggedIn) return last;
    } catch (err) {
      log.debug({ err: (err as Error).message }, 'probe during waitForLogin failed');
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return last;
}
