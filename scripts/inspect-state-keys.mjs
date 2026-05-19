import { readFileSync } from 'node:fs';

const raw = readFileSync('har/codesign.qq.com.har', 'utf8');
const har = JSON.parse(raw);
const entries = har.log.entries.filter(
  (e) => e.request?.method === 'POST' && /\/state-keys$/.test(e.request?.url ?? ''),
);

function parseBody(content) {
  if (!content?.text) return null;
  const text = content.encoding === 'base64'
    ? Buffer.from(content.text, 'base64').toString('utf8')
    : content.text;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function summarizeBody(body) {
  if (!body || typeof body !== 'object') return { kind: typeof body };
  const summary = {};
  for (const [key, value] of Object.entries(body)) {
    summary[key] = key === 'key' || /token|password|authorization|cookie/i.test(key)
      ? '<redacted>'
      : typeof value;
  }
  return summary;
}

for (const [i, e] of entries.entries()) {
  const c = e.response?.content;
  console.log(`--- entry ${i} ---`);
  console.log('status:', e.response.status);
  console.log('mimeType:', c?.mimeType);
  console.log('size:', c?.size);
  console.log('encoding:', c?.encoding);
  console.log('bodySummary:', JSON.stringify(summarizeBody(parseBody(c))));
}
