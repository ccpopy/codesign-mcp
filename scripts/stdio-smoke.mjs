// Stdio smoke test: 启动 dist/index.js，发 initialize + tools/prompts/resources 请求，比对返回。
// 不需要 codesign 网络，只验证 MCP 协议层和能力注册。

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const child = spawn('node', [resolve('dist/index.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, CODESIGN_LOG_LEVEL: 'error' },
});

const messages = [];
let buffer = '';
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      messages.push(JSON.parse(line));
    } catch (err) {
      console.error('[smoke] non-json line:', line);
    }
  }
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(`[child stderr] ${chunk}`);
});

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const initReq = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'stdio-smoke', version: '0.0.0' },
  },
};
send(initReq);

await wait(800);
send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
send({ jsonrpc: '2.0', id: 3, method: 'prompts/list' });
send({ jsonrpc: '2.0', id: 4, method: 'resources/list' });
send({
  jsonrpc: '2.0',
  id: 5,
  method: 'prompts/get',
  params: {
    name: 'implement_codesign_page',
    arguments: {
      sharingUrl: 'https://codesign.qq.com/s/example',
      artboardName: 'Home',
      outputDir: 'src/pages/home',
    },
  },
});
send({
  jsonrpc: '2.0',
  id: 6,
  method: 'resources/read',
  params: {
    uri: 'codesign://workflow/design-to-code',
  },
});

await wait(1500);

child.kill();
await new Promise((r) => child.once('exit', r));

let initOk = false;
let toolsOk = false;
let promptsOk = false;
let resourcesOk = false;
let promptGetOk = false;
let resourceReadOk = false;
let toolNames = [];
let promptNames = [];
let resourceUris = [];
for (const m of messages) {
  if (m.id === 1 && m.result?.serverInfo?.name === 'codesign-mcp') initOk = true;
  if (m.id === 2 && Array.isArray(m.result?.tools)) {
    toolsOk = true;
    toolNames = m.result.tools.map((t) => t.name);
  }
  if (m.id === 3 && Array.isArray(m.result?.prompts)) {
    promptsOk = true;
    promptNames = m.result.prompts.map((p) => p.name);
  }
  if (m.id === 4 && Array.isArray(m.result?.resources)) {
    resourcesOk = true;
    resourceUris = m.result.resources.map((r) => r.uri);
  }
  if (m.id === 5 && m.result?.messages?.[0]?.content?.text?.includes('list_artboards')) {
    promptGetOk = true;
  }
  if (m.id === 6 && m.result?.contents?.[0]?.text?.includes('get_artboard_spec')) {
    resourceReadOk = true;
  }
}

const expected = [
  'codesign_status',
  'codesign_login',
  'codesign_logout',
  'list_artboards',
  'get_artboard_spec',
  'get_artboard_image',
  'download_slice',
  'debug_collect_network',
];

const missing = expected.filter((n) => !toolNames.includes(n));
const expectedPrompts = ['implement_codesign_page'];
const missingPrompts = expectedPrompts.filter((n) => !promptNames.includes(n));
const expectedResources = ['codesign://workflow/design-to-code'];
const missingResources = expectedResources.filter((uri) => !resourceUris.includes(uri));

console.log(JSON.stringify({
  initOk,
  toolsOk,
  promptsOk,
  resourcesOk,
  promptGetOk,
  resourceReadOk,
  toolCount: toolNames.length,
  toolNames,
  missing,
  promptNames,
  missingPrompts,
  resourceUris,
  missingResources,
}, null, 2));

if (
  !initOk ||
  !toolsOk ||
  !promptsOk ||
  !resourcesOk ||
  !promptGetOk ||
  !resourceReadOk ||
  missing.length > 0 ||
  missingPrompts.length > 0 ||
  missingResources.length > 0
) {
  process.exit(1);
}
