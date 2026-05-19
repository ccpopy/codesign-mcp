// 脱敏工具，主要用于 debug_collect_network。
// 与 scripts/extract-fixtures.mjs 保持一致的规则。

const SENSITIVE_HEADER_NAMES = new Set([
  'cookie', 'set-cookie', 'authorization',
  'x-csrf-token', 'x-xsrf-token', 'x-codesign-token',
  'x-auth-token', 'x-tcb-token', 'x-real-ip', 'x-forwarded-for',
  'state-key',
]);

const ID_RULES: Array<{ re: RegExp; sub: string }> = [
  { re: /\/api\/sharings\/(\d{6,})/g, sub: '/api/sharings/SHARING_ID' },
  { re: /\/api\/designs\/(\d{6,})/g, sub: '/api/designs/DESIGN_ID' },
  { re: /\/app\/s\/(\d{6,})/g, sub: '/app/s/SHARING_ID' },
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
  return out;
}

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER_NAMES.has(name.toLowerCase());
}

export function redactHeaderValue(name: string, value: string): string {
  return isSensitiveHeader(name) ? '<redacted>' : redactUrl(value);
}

export function topLevelKeys(body: unknown): string[] {
  if (body == null) return [];
  if (Array.isArray(body)) return ['<array>'];
  if (typeof body === 'object') return Object.keys(body as Record<string, unknown>);
  return [`<${typeof body}>`];
}
