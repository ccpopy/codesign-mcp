import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { McpServer, StdioServerTransport } from '../dist/mcp/server.js';
import { objectSchema } from '../dist/mcp/schema.js';

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

async function createPromptHarness() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
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
