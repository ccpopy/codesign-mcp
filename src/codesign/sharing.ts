import type { Page } from 'playwright';
import { config } from '../config.js';
import { getLogger } from '../logger.js';
import { requestJson } from '../utils/http.js';
import { CodesignError } from './errors.js';
import { probeLoggedIn } from '../browser/session.js';
import type { SharingDetail, SharingScreen, StateKeyResponse } from './types.js';

const log = getLogger();

interface StateKeyResultOk {
  key: string;
  expires: number;
}

// POST /api/sharings/:id/state-keys
export async function exchangePassword(
  page: Page,
  sharingId: string,
  password: string,
): Promise<StateKeyResultOk> {
  await ensureOnOrigin(page, sharingId);
  const resp = await requestJson<StateKeyResponse | { message?: string }>(page.context().request, {
    method: 'POST',
    url: `${config.origin}/api/sharings/${sharingId}/state-keys`,
    body: { password },
  });
  log.debug({ status: resp.status }, 'state-keys response');
  if (resp.status === 200 && resp.body && typeof resp.body === 'object' && 'key' in resp.body) {
    const body = resp.body as StateKeyResponse;
    return { key: body.key, expires: body.expires };
  }
  if (resp.status === 403) {
    throw new CodesignError('INVALID_PASSWORD', 'Sharing password is incorrect', {
      sharingId,
      serverMessage: (resp.body as { message?: string } | null)?.message,
    });
  }
  if (resp.status === 401) {
    throw new CodesignError('NEED_LOGIN', 'state-keys requires login', { sharingId });
  }
  if (resp.status === 404) {
    throw new CodesignError('SHARING_NOT_FOUND', 'sharing not found', { sharingId });
  }
  throw new CodesignError('SHARING_NOT_FOUND', 'unexpected state-keys response', {
    sharingId,
    status: resp.status,
  });
}

// GET /api/sharings/:id  [state-key header]
export async function fetchSharingDetail(
  page: Page,
  sharingId: string,
  stateKey?: string,
): Promise<SharingDetail> {
  await ensureOnOrigin(page, sharingId);
  const headers: Record<string, string> = {};
  if (stateKey) headers['state-key'] = stateKey;
  const resp = await requestJson<SharingDetail | { message?: string; context?: unknown }>(page.context().request, {
    url: `${config.origin}/api/sharings/${sharingId}`,
    headers,
  });
  log.debug({ status: resp.status, hasStateKey: !!stateKey }, 'sharing-detail response');

  if (resp.status === 200) {
    return normalizeSharingDetail(resp.body, { sharingId, status: resp.status });
  }
  if (resp.status === 403) {
    // 没有 state-key 通常意味着需要密码
    throw new CodesignError('NEED_PASSWORD', 'this sharing requires a password', {
      sharingId,
      sharing_title:
        (resp.body as { context?: { sharing_title?: string } } | null)?.context?.sharing_title,
    });
  }
  if (resp.status === 401) {
    throw new CodesignError('NEED_LOGIN', 'sharing requires login', { sharingId });
  }
  if (resp.status === 404) {
    throw new CodesignError('SHARING_NOT_FOUND', 'sharing not found', { sharingId });
  }
  throw new CodesignError('SHARING_NOT_FOUND', 'unexpected sharing-detail response', {
    sharingId,
    status: resp.status,
  });
}

export function normalizeSharingDetail(
  body: unknown,
  errorDetails?: Record<string, unknown>,
): SharingDetail {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw unexpectedSharingDetail(errorDetails);
  }

  const record = body as Record<string, unknown>;
  if (Array.isArray(record.designs)) {
    return body as SharingDetail;
  }

  if (!Array.isArray(record.screens)) {
    throw unexpectedSharingDetail(errorDetails);
  }

  const id = record.id;
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) {
    throw unexpectedSharingDetail(errorDetails);
  }

  const title = firstNonEmptyString(record.title, record.name) ?? `Sharing ${id}`;
  const designId =
    typeof record.design_id === 'number' && Number.isSafeInteger(record.design_id)
      ? record.design_id
      : id;
  const designName = firstNonEmptyString(record.design_name, record.name, record.title) ?? title;

  return {
    id,
    title,
    designs: [
      {
        id: designId,
        name: designName,
        screens: record.screens as SharingScreen[],
      },
    ],
  };
}

function unexpectedSharingDetail(details?: Record<string, unknown>): CodesignError {
  return new CodesignError(
    'SHARING_NOT_FOUND',
    'unexpected sharing-detail response',
    details,
  );
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

// 综合入口：根据 password 选择是否换 state-key，再拉 detail。
export async function getSharingDetail(
  page: Page,
  sharingId: string,
  password?: string,
): Promise<{ detail: SharingDetail; stateKey?: string }> {
  let stateKey: string | undefined;
  if (password) {
    const sk = await exchangePassword(page, sharingId, password);
    stateKey = sk.key;
  }
  try {
    const detail = await fetchSharingDetail(page, sharingId, stateKey);
    return stateKey ? { detail, stateKey } : { detail };
  } catch (err) {
    if (err instanceof CodesignError && err.code === 'NEED_PASSWORD' && !password) {
      // 透传，让 tool 层处理
      throw err;
    }
    throw err;
  }
}

// 确保 page 在 codesign.qq.com 同源上下文。
// 直接打开分享页（无需登录就能加载），cookie/state 会就位。
async function ensureOnOrigin(page: Page, sharingId: string): Promise<void> {
  const current = page.url();
  if (current.startsWith(config.origin)) return;
  const target = `${config.origin}/app/s/${sharingId}`;
  log.debug({ target }, 'navigating to sharing page for origin context');
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: config.navTimeoutMs });
}

// 检查是否需要登录（探测 /api/user 的便捷封装）
export async function ensureLoggedInOrThrow(page: Page): Promise<void> {
  const probe = await probeLoggedIn(page);
  if (!probe.loggedIn) {
    throw new CodesignError('NEED_LOGIN', 'user is not logged in', { status: probe.status });
  }
}
