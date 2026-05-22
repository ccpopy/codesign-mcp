// 脱敏工具，主要用于 debug_collect_network。
// 与 scripts/extract-fixtures.mjs 保持一致的规则。

const SENSITIVE_HEADER_NAMES = new Set([
  'cookie', 'set-cookie', 'authorization',
  'x-csrf-token', 'x-xsrf-token', 'x-codesign-token',
  'x-auth-token', 'x-tcb-token', 'x-real-ip', 'x-forwarded-for',
  'state-key', 'x-team-id', 'x-corp-id', 'x-user-id', 'x-project-id',
]);

const ID_RULES: Array<{ re: RegExp; sub: string }> = [
  { re: /\/api\/sharings\/(\d{6,})/g, sub: '/api/sharings/SHARING_ID' },
  { re: /\/api\/designs\/(\d{6,})/g, sub: '/api/designs/DESIGN_ID' },
  { re: /\/api\/users\/(\d{6,})/g, sub: '/api/users/USER_ID' },
  { re: /\/api\/teams\/(\d{6,})/g, sub: '/api/teams/TEAM_ID' },
  { re: /\/api\/companies\/(\d{6,})/g, sub: '/api/companies/COMPANY_ID' },
  { re: /\/api\/departments\/(\d{6,})/g, sub: '/api/departments/DEPARTMENT_ID' },
  { re: /\/api\/projects\/(\d{6,})/g, sub: '/api/projects/PROJECT_ID' },
  { re: /\/app\/s\/(\d{6,})/g, sub: '/app/s/SHARING_ID' },
  { re: /\/s\/(\d{6,})/g, sub: '/s/SHARING_ID' },
  {
    re: /cdn(\d?)\.codesign\.qq\.com\/meta\/(\d{4})\/(\d{2})\/(\d{2})\/([\w-]+)\/([\w-]+)\/([\w-]+)\.json/g,
    sub: 'cdn$1.codesign.qq.com/meta/$2/$3/$4/TOKEN_A/TOKEN_B/UUID.json',
  },
  { re: /\/oauth\/check\?key=[\w-]+/g, sub: '/oauth/check?key=OAUTH_KEY' },
];

export function redactUrl(u: string): string {
  if (typeof u !== 'string') return u;
  let out = u;
  for (const r of ID_RULES) out = out.replace(r.re, r.sub);
  return redactStructuredUrl(out);
}

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER_NAMES.has(name.toLowerCase());
}

export function redactHeaderValue(name: string, value: string): string {
  return isSensitiveHeader(name) ? '<redacted>' : redactUrl(value);
}

export function topLevelKeys(body: unknown, maxDepth = 0): string[] {
  if (body == null) return [];
  if (Array.isArray(body)) return ['<array>'];
  if (typeof body === 'object') return collectObjectKeys(body as Record<string, unknown>, maxDepth);
  return [`<${typeof body}>`];
}

function redactStructuredUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }

  const pathname = redactPathname(url.hostname, url.pathname);
  const search = redactSearch(url.search);
  const hash = url.hash ? '#<redacted-fragment>' : '';
  return `${url.origin}${pathname}${search}${hash}`;
}

function redactPathname(hostname: string, pathname: string): string {
  if (!/^cdn\d*\.codesign\.qq\.com$/i.test(hostname)) return pathname;
  const parts = pathname.split('/');
  const family = parts[1];
  if (!family || !['meta', 'screen-slices', 'screens'].includes(family)) return pathname;

  const datePrefixLength = family === 'screens' && ['previews', 'covers'].includes(parts[2])
    ? 6
    : 5;
  if (parts.length <= datePrefixLength) return pathname;

  const prefix = parts.slice(0, datePrefixLength);
  const filename = parts.at(-1) ?? '';
  return [...prefix, redactFilename(filename)].join('/');
}

function redactFilename(filename: string): string {
  const ext = filename.match(/\.[a-z0-9]+$/i)?.[0] ?? '';
  return `<redacted>${ext}`;
}

function redactSearch(search: string): string {
  if (!search) return '';
  const query = search.slice(1);
  if (!query) return '';
  const parts = query.split('&');
  return `?${parts.map(redactQueryPart).join('&')}`;
}

function redactQueryPart(part: string): string {
  if (!part || !part.includes('=')) return '<redacted-query>';
  const key = part.slice(0, part.indexOf('='));
  return `${key}=<redacted>`;
}

function collectObjectKeys(body: Record<string, unknown>, maxDepth: number): string[] {
  const out: string[] = [];
  collectKeys(body, '', maxDepth, out);
  return out;
}

function collectKeys(value: unknown, prefix: string, depthRemaining: number, out: string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(path);
    if (depthRemaining > 0) collectKeys(child, path, depthRemaining - 1, out);
  }
}
