import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { McpServer, StdioServerTransport } from '../dist/mcp/server.js';
import { objectSchema } from '../dist/mcp/schema.js';
import { registerDesignToCodePrompt } from '../dist/prompts/design-to-code.js';
import { registerSpecTool } from '../dist/tools/spec.js';

test('prompts/get reports invalid prompt arguments as JSON-RPC invalid params', async () => {
  const harness = await createPromptHarness();
  try {
    const response = await harness.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'prompts/get',
      params: {
        name: 'sample_prompt',
        arguments: {},
      },
    });

    assert.equal(response.result, undefined);
    assert.equal(response.error?.code, -32602);
    assert.match(response.error?.message ?? '', /prompts\.sample_prompt\.sharingUrl is required/);
  } finally {
    await harness.close();
  }
});

test('design-to-code prompt carries copied selection identifiers and defaults to region scope', async () => {
  const harness = await createPromptHarness(registerDesignToCodePrompt);
  try {
    const response = await harness.request({
      jsonrpc: '2.0',
      id: 2,
      method: 'prompts/get',
      params: {
        name: 'implement_codesign_page',
        arguments: {
          sharingUrl: 'https://codesign.qq.com/s/example',
          screenId: 123,
          layerObjectId: 'LAYER_OBJECT_ID',
          layerName: 'Map analysis',
        },
      },
    });

    const text = response.result?.messages?.[0]?.content?.text ?? '';
    assert.match(text, /Screen ID: 123/);
    assert.match(text, /Layer object ID: LAYER_OBJECT_ID/);
    assert.match(text, /Selected layer: Map analysis/);
    assert.match(text, /Selection scope: region/);
    assert.match(text, /selection\.hierarchy/);
    assert.match(text, /user's current request explicitly requires an absolute-positioned/);
    assert.match(text, /honor that instruction/);
  } finally {
    await harness.close();
  }
});

test('get_artboard_spec rejects a region scope without a layer object id', async () => {
  const harness = await createPromptHarness(registerSpecTool);
  try {
    const response = await harness.request({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_artboard_spec',
        arguments: {
          sharingUrl: 'https://codesign.qq.com/s/123456',
          selectionScope: 'region',
        },
      },
    });

    assert.equal(response.result?.structuredContent?.ok, false);
    assert.equal(response.result?.structuredContent?.error?.code, 'INVALID_SELECTION');
    assert.match(response.result?.structuredContent?.error?.message ?? '', /layerObjectId/);
  } finally {
    await harness.close();
  }
});

async function createPromptHarness(registerPrompt) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  if (registerPrompt) {
    registerPrompt(server);
  } else {
    server.registerPrompt(
      'sample_prompt',
      {
        argsSchema: objectSchema(
          {
            sharingUrl: { type: 'string', minLength: 1 },
          },
          ['sharingUrl'],
        ),
      },
      async ({ sharingUrl }) => ({
        messages: [{ role: 'user', content: { type: 'text', text: sharingUrl } }],
      }),
    );
  }

  const messages = [];
  const waiters = [];
  let buffer = '';
  stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const parsed = JSON.parse(line);
        const waiter = waiters.shift();
        if (waiter) waiter(parsed);
        else messages.push(parsed);
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });

  await server.connect(new StdioServerTransport(stdin, stdout));

  return {
    request(message) {
      const response = nextMessage(messages, waiters);
      stdin.write(`${JSON.stringify(message)}\n`);
      return response;
    },
    async close() {
      await server.close();
      stdin.destroy();
      stdout.destroy();
    },
  };
}

function nextMessage(messages, waiters) {
  const message = messages.shift();
  if (message) return Promise.resolve(message);
  return new Promise((resolveMessage) => {
    waiters.push(resolveMessage);
  });
}
