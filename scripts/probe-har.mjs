// Probe HAR: 列出关键 URL 模式命中条目数和样本，验证 plan.md 假设。
// 用法: node --max-old-space-size=4096 scripts/probe-har.mjs

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HAR_PATH = resolve('har/codesign.qq.com.har');

const PATTERNS = [
  {
    name: 'state-keys',
    test: (u, m) => m === 'POST' && /\/api\/sharings\/[^/]+\/state-keys$/.test(u),
  },
  {
    name: 'sharings-detail',
    test: (u, m) => m === 'GET' && /\/api\/sharings\/[^/?]+(\?|$)/.test(u) && !/\/state-keys/.test(u),
  },
  {
    name: 'user',
    test: (u, m) => m === 'GET' && /\/api\/user(\?|$)/.test(u),
  },
  {
    name: 'oauth-check',
    test: (u, m) => /\/oauth\/check/.test(u),
  },
  {
    name: 'designs-detail',
    test: (u, m) => m === 'GET' && /\/api\/designs\/[^/?]+(\?|$)/.test(u),
  },
  {
    name: 'cdn-meta-json',
    test: (u) => /cdn\d?\.codesign\.qq\.com\/meta\/.+\.json/.test(u),
  },
  {
    name: 'sharing-page',
    test: (u, m) => m === 'GET' && /codesign\.qq\.com\/app\/s\//.test(u),
  },
];

const raw = readFileSync(HAR_PATH, 'utf8');
console.error(`[probe] read ${(raw.length / 1024 / 1024).toFixed(2)} MB`);
const har = JSON.parse(raw);
const entries = har?.log?.entries ?? [];
console.error(`[probe] entries: ${entries.length}`);

const buckets = Object.fromEntries(PATTERNS.map((p) => [p.name, []]));

for (const e of entries) {
  const url = e.request?.url ?? '';
  const method = e.request?.method ?? '';
  const status = e.response?.status ?? 0;
  const mime = e.response?.content?.mimeType ?? '';
  const size = e.response?.content?.size ?? 0;
  for (const p of PATTERNS) {
    if (p.test(url, method)) {
      buckets[p.name].push({ url, method, status, mime, size });
    }
  }
}

const summary = {};
for (const [name, hits] of Object.entries(buckets)) {
  summary[name] = {
    count: hits.length,
    sample: hits.slice(0, 3).map((h) => ({
      method: h.method,
      status: h.status,
      mime: h.mime,
      size: h.size,
      url: h.url.length > 160 ? h.url.slice(0, 160) + '…' : h.url,
    })),
  };
}

process.stdout.write(JSON.stringify(summary, null, 2));
process.stdout.write('\n');
