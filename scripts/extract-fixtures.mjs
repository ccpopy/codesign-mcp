// Extract HAR fixtures: state-keys / sharing-detail / cdn meta (spec + slice manifest)
// 输出到 tests/fixtures/，脱敏处理。
// 用法: node --max-old-space-size=4096 scripts/extract-fixtures.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const HAR_PATH = resolve('har/codesign.qq.com.har');
const OUT_DIR = resolve('tests/fixtures');
mkdirSync(OUT_DIR, { recursive: true });

// ----------------------- 脱敏 -----------------------

// 把请求中能识别的敏感 ID/Token 替换成占位符。
// 保留长度提示信息便于后续解析时识别字段形态。
const REDACT_RULES = [
  { re: /\/api\/sharings\/(\d{6,})/g, sub: '/api/sharings/SHARING_ID' },
  { re: /\/api\/designs\/(\d{6,})/g, sub: '/api/designs/DESIGN_ID' },
  { re: /\/app\/s\/(\d{6,})/g, sub: '/app/s/SHARING_ID' },
  // CDN meta URL 中的 token 路径分段（避免泄露真实路径，但保留结构）
  { re: /cdn(\d?)\.codesign\.qq\.com\/meta\/(\d{4})\/(\d{2})\/(\d{2})\/([\w-]+)\/([\w-]+)\/([\w-]+)\.json/g,
    sub: 'cdn$1.codesign.qq.com/meta/$2/$3/$4/TOKEN_A/TOKEN_B/UUID.json' },
  // oauth check key
  { re: /\/oauth\/check\?key=[\w-]+/g, sub: '/oauth/check?key=OAUTH_KEY' },
];

function redactUrl(u) {
  if (typeof u !== 'string') return u;
  let out = u;
  for (const r of REDACT_RULES) out = out.replace(r.re, r.sub);
  return out;
}

const SENSITIVE_HEADERS = new Set([
  'cookie', 'set-cookie', 'authorization',
  'x-csrf-token', 'x-xsrf-token', 'x-codesign-token',
  'x-auth-token', 'x-tcb-token', 'x-real-ip', 'x-forwarded-for',
]);

function redactHeaders(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((h) => h && typeof h.name === 'string')
    .map((h) => {
      const name = h.name.toLowerCase();
      if (SENSITIVE_HEADERS.has(name)) return { name: h.name, value: '<redacted>' };
      return { name: h.name, value: typeof h.value === 'string' ? redactUrl(h.value) : h.value };
    });
}

function redactPostData(pd) {
  if (!pd) return undefined;
  const out = { mimeType: pd.mimeType };
  if (pd.text) {
    // 尝试 JSON parse 后再脱敏 password 字段
    try {
      const obj = JSON.parse(pd.text);
      if (obj && typeof obj === 'object') {
        if ('password' in obj) obj.password = '<redacted>';
        out.text = JSON.stringify(obj);
        out.parsed = obj;
        return out;
      }
    } catch {}
    out.text = redactUrl(pd.text);
  }
  if (pd.params) out.params = pd.params;
  return out;
}

// 完全屏蔽（替换为 <redacted> 或 null）
const FULL_REDACT_KEYS = new Set([
  'key', 'state_key', 'token', 'access_token', 'refresh_token',
  'password',
  'email', 'phone', 'birthday',
  'avatar', 'avatar_url',
  'last_ip', 'request_id',
]);

// PII 字段，替换为占位但保留类型/结构
const PII_NAME_KEYS = new Set([
  'username', 'alias', 'nickname',
  'display_name', 'default_display_name', 'team_display_name', 'company_display_name',
  'staff_type_name', 'genus_name', 'clan_name',
  'department_name',
]);

// 业务标题类（保留长度感但不暴露内容）
const TITLE_KEYS = new Set([
  'title', 'sharing_title',
]);

function maskString(s, replacement = 'X') {
  if (typeof s !== 'string' || s.length === 0) return s;
  return replacement.repeat(Math.min(s.length, 8));
}

// 深度遍历响应 body 中的字符串，脱敏 URL/ID/PII
function redactDeep(value, parentKey = '') {
  if (value == null) return value;
  if (typeof value === 'string') return redactUrl(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, parentKey));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (FULL_REDACT_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
        out[k] = typeof v === 'string' ? '<redacted>' : null;
        continue;
      }
      if (PII_NAME_KEYS.has(k) && typeof v === 'string') {
        out[k] = maskString(v, 'X');
        continue;
      }
      if (TITLE_KEYS.has(k) && typeof v === 'string') {
        out[k] = maskString(v, 'T');
        continue;
      }
      out[k] = redactDeep(v, k);
    }
    return out;
  }
  return value;
}

// ----------------------- 解析 HAR -----------------------

const raw = readFileSync(HAR_PATH, 'utf8');
console.error(`[extract] read ${(raw.length / 1024 / 1024).toFixed(2)} MB`);
const har = JSON.parse(raw);
const entries = har?.log?.entries ?? [];

function parseBody(entry) {
  const c = entry.response?.content;
  if (!c?.text) return undefined;
  if (c.encoding === 'base64') {
    try {
      const decoded = Buffer.from(c.text, 'base64').toString('utf8');
      return decoded;
    } catch { return undefined; }
  }
  return c.text;
}

function entryToFixture(entry, opts = {}) {
  const req = entry.request;
  const res = entry.response;
  const bodyText = parseBody(entry);
  let bodyJson;
  if (bodyText && (res.content?.mimeType || '').includes('json')) {
    try { bodyJson = JSON.parse(bodyText); } catch {}
  }
  const fixture = {
    capturedAt: entry.startedDateTime,
    request: {
      method: req.method,
      url: redactUrl(req.url),
      headers: redactHeaders(req.headers),
      queryString: (req.queryString ?? []).map((q) => ({ name: q.name, value: redactUrl(q.value) })),
      postData: redactPostData(req.postData),
    },
    response: {
      status: res.status,
      statusText: res.statusText,
      mimeType: res.content?.mimeType,
      size: res.content?.size,
      headers: redactHeaders(res.headers),
    },
  };
  if (bodyJson !== undefined) {
    fixture.response.body = redactDeep(bodyJson);
  } else if (bodyText && opts.allowText) {
    fixture.response.bodyText = bodyText.length > 2000 ? bodyText.slice(0, 2000) + '…<truncated>' : bodyText;
  }
  return fixture;
}

// ----------------------- 抽取 -----------------------

function findAll(pred) {
  return entries.filter(pred).map((e) => entryToFixture(e));
}

// 选样本时优先要 body 不为空的
function pickWithBody(arr, status) {
  const matched = arr.filter((e) => e.response?.status === status);
  return matched.find((e) => e.response?.content?.text) ?? matched[0];
}

// 1) state-keys: 保留 403 + 200 各一条
const stateKeys = entries.filter(
  (e) => e.request?.method === 'POST' &&
         /\/api\/sharings\/[^/]+\/state-keys$/.test(e.request?.url ?? ''),
);
const stateKeysFixture = {
  description: 'POST /api/sharings/:sharingId/state-keys — 用密码换取 state-key',
  source: 'har/codesign.qq.com.har',
  samples: {
    success: (pickWithBody(stateKeys, 200) && entryToFixture(pickWithBody(stateKeys, 200))) ?? null,
    forbidden: (pickWithBody(stateKeys, 403) && entryToFixture(pickWithBody(stateKeys, 403))) ?? null,
  },
};

// 2) sharings-detail: 取一条 200 且 body 非空
const sharingsDetailCandidates = entries.filter(
  (e) => e.request?.method === 'GET' &&
         /\/api\/sharings\/[^/?]+(\?|$)/.test(e.request?.url ?? '') &&
         !/\/state-keys/.test(e.request?.url ?? '') &&
         e.response?.status === 200,
);
const sharingsDetail = sharingsDetailCandidates.find((e) => e.response?.content?.text)
  ?? sharingsDetailCandidates[0];
const sharingsDetailFixture = sharingsDetail ? {
  description: 'GET /api/sharings/:sharingId — 分享内容（designs[].screens[]）',
  source: 'har/codesign.qq.com.har',
  sample: entryToFixture(sharingsDetail),
} : null;

// 3) user: 401 + 200 各一条
const userEntries = entries.filter(
  (e) => e.request?.method === 'GET' && /\/api\/user(\?|$)/.test(e.request?.url ?? ''),
);
const userFixture = {
  description: 'GET /api/user — 用户身份',
  source: 'har/codesign.qq.com.har',
  samples: {
    unauthorized: (pickWithBody(userEntries, 401) && entryToFixture(pickWithBody(userEntries, 401))) ?? null,
    authorized: (pickWithBody(userEntries, 200) && entryToFixture(pickWithBody(userEntries, 200))) ?? null,
  },
};

// 4) CDN meta JSON: 区分 spec object（对象 + layers） vs slice manifest（数组）
const cdnMetas = entries.filter((e) => /cdn\d?\.codesign\.qq\.com\/meta\/.+\.json/.test(e.request?.url ?? '') && e.response?.status === 200);

let specSample = null;
let sliceSample = null;
const specSamples = [];
const sliceSamples = [];
for (const e of cdnMetas) {
  const text = parseBody(e);
  if (!text) continue;
  let parsed;
  try { parsed = JSON.parse(text); } catch { continue; }
  if (Array.isArray(parsed)) {
    sliceSamples.push({ entry: e, size: text.length });
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.layers)) {
    specSamples.push({ entry: e, size: text.length });
  } else if (parsed && typeof parsed === 'object') {
    // 也可能是 spec object 没有 layers（极少），归到 spec
    specSamples.push({ entry: e, size: text.length, hasLayers: false });
  }
}

// 选择中等大小的样本（避免最大的塞爆 fixture）
specSamples.sort((a, b) => a.size - b.size);
sliceSamples.sort((a, b) => a.size - b.size);
const specPick = specSamples[Math.floor(specSamples.length / 2)] ?? specSamples[0];
const slicePick = sliceSamples[Math.floor(sliceSamples.length / 2)] ?? sliceSamples[0];

const specFixture = specPick ? {
  description: 'CDN meta JSON — spec object（画板和图层标注）',
  source: 'har/codesign.qq.com.har',
  sourceUrlPattern: 'https://cdn4.codesign.qq.com/meta/YYYY/MM/DD/:tokenA/:tokenB/:uuid.json',
  pickedFromSizes: specSamples.map((s) => s.size),
  sample: entryToFixture(specPick.entry),
} : null;

const sliceFixture = slicePick ? {
  description: 'CDN meta JSON — slice manifest（切图清单数组）',
  source: 'har/codesign.qq.com.har',
  sourceUrlPattern: 'https://cdn4.codesign.qq.com/meta/YYYY/MM/DD/:tokenA/:tokenB/:uuid.json',
  pickedFromSizes: sliceSamples.map((s) => s.size),
  sample: entryToFixture(slicePick.entry),
} : null;

// 5) designs detail（信息性）
const designsEntries = entries.filter(
  (e) => e.request?.method === 'GET' && /\/api\/designs\/[^/?]+(\?|$)/.test(e.request?.url ?? ''),
);
const designsFixture = {
  description: 'GET /api/designs/:designId — MVP 不依赖，仅供参考',
  source: 'har/codesign.qq.com.har',
  samples: {
    unauthorized: (pickWithBody(designsEntries, 401) && entryToFixture(pickWithBody(designsEntries, 401))) ?? null,
    authorized: (pickWithBody(designsEntries, 200) && entryToFixture(pickWithBody(designsEntries, 200))) ?? null,
  },
};

// 6) oauth check（信息性，扫码轮询）
const oauthCandidates = entries.filter((e) => /\/oauth\/check/.test(e.request?.url ?? ''));
const oauthSample = oauthCandidates.find((e) => e.response?.content?.text) ?? oauthCandidates[0];
const oauthFixture = oauthSample ? {
  description: 'GET /oauth/check?key=... — 扫码登录轮询',
  source: 'har/codesign.qq.com.har',
  sample: entryToFixture(oauthSample),
} : null;

// ----------------------- 写盘 -----------------------

function writeFixture(name, data) {
  const file = resolve(OUT_DIR, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.error(`[extract] wrote ${name} (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`);
}

writeFixture('sharing-state-keys.json', stateKeysFixture);
if (sharingsDetailFixture) writeFixture('sharing-detail.json', sharingsDetailFixture);
writeFixture('user.json', userFixture);
if (specFixture) writeFixture('meta-spec-object.json', specFixture);
if (sliceFixture) writeFixture('meta-slice-manifest.json', sliceFixture);
writeFixture('designs-detail.json', designsFixture);
if (oauthFixture) writeFixture('oauth-check.json', oauthFixture);

// 7) 索引
const index = {
  generatedAt: new Date().toISOString(),
  source: 'har/codesign.qq.com.har',
  entriesTotal: entries.length,
  files: [
    { name: 'sharing-state-keys.json', purpose: '密码换 key 请求/响应（含 200 和 403）' },
    sharingsDetailFixture && { name: 'sharing-detail.json', purpose: '分享详情 + designs[].screens[]' },
    { name: 'user.json', purpose: '/api/user 已登录与未登录响应' },
    specFixture && { name: 'meta-spec-object.json', purpose: 'CDN meta spec object（画板 + layers）' },
    sliceFixture && { name: 'meta-slice-manifest.json', purpose: 'CDN meta slice manifest（数组）' },
    { name: 'designs-detail.json', purpose: '/api/designs/:id 401 + 200（参考）' },
    oauthFixture && { name: 'oauth-check.json', purpose: '/oauth/check 扫码轮询（参考）' },
  ].filter(Boolean),
  cdnMetaStats: {
    total: cdnMetas.length,
    specObjects: specSamples.length,
    sliceManifests: sliceSamples.length,
    specSizes: specSamples.map((s) => s.size),
    sliceSizes: sliceSamples.map((s) => s.size),
  },
};
writeFixture('index.json', index);

console.error('[extract] done.');
