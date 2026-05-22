import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CodesignError } from '../dist/codesign/errors.js';
import { requestJson } from '../dist/utils/http.js';

test('requestJson returns successful same-origin JSON responses', async () => {
  const request = fakeRequest({
    status: 200,
    rawText: '{"ok":true}',
  });

  const result = await requestJson(request, { url: 'https://codesign.qq.com/api/sharings/123456' });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
});

test('requestJson exposes request failures as CodesignError', async () => {
  const request = fakeRequestFailure(new Error('Failed to fetch'));

  await assert.rejects(
    () => requestJson(request, { url: 'https://codesign.qq.com/api/sharings/123456' }),
    (err) => {
      assert.ok(err instanceof CodesignError);
      assert.equal(err.code, 'SHARING_FETCH_FAILED');
      assert.match(err.message, /Failed to fetch/);
      return true;
    },
  );
});

test('requestJson rejects non-CoDesign origins before sending', async () => {
  const request = fakeRequest({ status: 200, rawText: '{"ok":true}' });

  await assert.rejects(
    () => requestJson(request, { url: 'https://example.test/api/sharings/123456' }),
    (err) => {
      assert.ok(err instanceof CodesignError);
      assert.equal(err.code, 'REMOTE_URL_NOT_ALLOWED');
      assert.equal(request.calls(), 0);
      return true;
    },
  );
});

function fakeRequest(result) {
  let callCount = 0;
  return {
    calls() {
      return callCount;
    },
    async fetch() {
      callCount += 1;
      return {
        status: () => result.status,
        text: async () => result.rawText,
      };
    },
  };
}

function fakeRequestFailure(error) {
  return {
    async fetch() {
      throw error;
    },
  };
}
