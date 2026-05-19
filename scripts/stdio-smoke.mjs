// Stdio smoke test: 启动 dist/index.js，发 initialize + tools/list，比对返回。
// 不需要 codesign 网络，只验证 MCP 协议层和工具注册。

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

await wait(1500);

child.kill();
await new Promise((r) => child.once('exit', r));

let initOk = false;
let toolsOk = false;
let toolNames = [];
for (const m of messages) {
  if (m.id === 1 && m.result?.serverInfo?.name === 'codesign-mcp') initOk = true;
  if (m.id === 2 && Array.isArray(m.result?.tools)) {
    toolsOk = true;
    toolNames = m.result.tools.map((t) => t.name);
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

console.log(JSON.stringify({
  initOk,
  toolsOk,
  toolCount: toolNames.length,
  toolNames,
  missing,
}, null, 2));

if (!initOk || !toolsOk || missing.length > 0) {
  process.exit(1);
}
