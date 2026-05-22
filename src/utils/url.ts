import { CodesignError } from '../codesign/errors.js';

// 接受的输入：
//   https://codesign.qq.com/app/s/<id>
//   https://codesign.qq.com/s/<id>
//   https://codesign.qq.com/app/s/<id>?password=xxx
//   纯数字 <id>
export function parseSharingId(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new CodesignError('INVALID_SHARING_URL', 'sharingUrl is empty');
  }
  const trimmed = input.trim();
  // 纯数字
  if (/^\d{6,}$/.test(trimmed)) return trimmed;
  // URL
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new CodesignError('INVALID_SHARING_URL', `cannot parse as URL: ${trimmed}`);
  }
  const m = u.pathname.match(/\/(?:app\/)?s\/(\d{6,})(?:\/|$)/);
  if (!m) {
    throw new CodesignError('INVALID_SHARING_URL', `path does not contain /s/<id>: ${u.pathname}`);
  }
  return m[1]!;
}

export function getSharingPageUrl(sharingId: string, origin = 'https://codesign.qq.com'): string {
  return `${origin}/app/s/${sharingId}`;
}

export function normalizeCodesignAssetUrl(
  input: string,
  cdnOrigin = 'https://cdn4.codesign.qq.com',
): string {
  let source: URL;
  try {
    source = new URL(input);
  } catch {
    return input;
  }

  if (
    /^codesign-\d+\.cos(?:\.[a-z0-9-]+)*\.myqcloud\.com$/i.test(source.hostname) &&
    isCodesignCosAssetPath(source.pathname)
  ) {
    const cdn = new URL(cdnOrigin);
    return `${cdn.origin}${source.pathname}${source.search}`;
  }

  return input;
}

export function assertCodesignOriginUrl(
  input: string,
  purpose: string,
  origin = 'https://codesign.qq.com',
): string {
  let url: URL;
  let allowedOrigin: URL;
  try {
    url = new URL(input);
    allowedOrigin = new URL(origin);
  } catch {
    throw new CodesignError('REMOTE_URL_NOT_ALLOWED', `${purpose} url is not a valid URL`, {
      url: input,
    });
  }

  if (url.origin === allowedOrigin.origin) return input;

  throw new CodesignError('REMOTE_URL_NOT_ALLOWED', `${purpose} url must stay on CoDesign origin`, {
    url: input,
    origin: url.origin,
    allowedOrigin: allowedOrigin.origin,
  });
}

export function assertAllowedRemoteUrl(input: string, purpose: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new CodesignError('REMOTE_URL_NOT_ALLOWED', `${purpose} url is not a valid URL`, {
      url: input,
    });
  }

  if (url.protocol !== 'https:') {
    throw new CodesignError('REMOTE_URL_NOT_ALLOWED', `${purpose} url must use https`, {
      url: input,
      protocol: url.protocol,
    });
  }

  if (isAllowedCodesignHost(url.hostname)) return input;

  throw new CodesignError('REMOTE_URL_NOT_ALLOWED', `${purpose} url host is not allowed`, {
    url: input,
    host: url.hostname,
    allowedHosts: ['codesign.qq.com', 'cdn*.codesign.qq.com'],
  });
}

export function isAllowedCodesignHost(hostname: string): boolean {
  return hostname === 'codesign.qq.com' || /^cdn\d*\.codesign\.qq\.com$/i.test(hostname);
}

function isCodesignCosAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith('/screen-slices/') ||
    pathname.startsWith('/screens/') ||
    pathname.startsWith('/meta/')
  );
}
