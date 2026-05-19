import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CodesignError } from '../dist/codesign/errors.js';
import { requestJson } from '../dist/utils/http.js';

test('requestJson returns successful same-origin JSON responses', async () => {
  const page = fakePageEvaluate({
    status: 200,
    body: { ok: true },
    rawText: '{"ok":true}',
  });

  const result = await requestJson(page, { url: 'https://codesign.qq.com/api/sharings/123456' });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
});

test('requestJson exposes in-page fetch failures as CodesignError', async () => {
  const page = fakePageEvaluate({
    status: 0,
    body: null,
    rawText: undefined,
    fetchError: 'Failed to fetch',
  });

  await assert.rejects(
    () => requestJson(page, { url: 'https://codesign.qq.com/api/sharings/123456' }),
    (err) => {
      assert.ok(err instanceof CodesignError);
      assert.equal(err.code, 'SHARING_FETCH_FAILED');
      assert.match(err.message, /Failed to fetch/);
      return true;
    },
  );
});

function fakePageEvaluate(result) {
  return {
    async evaluate() {
      return result;
    },
  };
}
