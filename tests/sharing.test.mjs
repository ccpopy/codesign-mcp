import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSharingDetail } from '../dist/codesign/sharing.js';

const fixture = JSON.parse(
  readFileSync(resolve('tests/fixtures/sharing-detail.json'), 'utf8'),
).sample.response.body;

test('normalizeSharingDetail preserves the nested designs response', () => {
  const normalized = normalizeSharingDetail(fixture);

  assert.equal(normalized, fixture);
});

test('normalizeSharingDetail wraps top-level screens as a synthetic design', () => {
  const screens = fixture.designs[0].screens;
  const response = {
    id: fixture.id,
    title: fixture.title,
    screens,
  };

  const normalized = normalizeSharingDetail(response);

  assert.equal(normalized.id, fixture.id);
  assert.equal(normalized.title, fixture.title);
  assert.deepEqual(normalized.designs, [
    {
      id: fixture.id,
      name: fixture.title,
      screens,
    },
  ]);
});

test('normalizeSharingDetail rejects unknown response shapes', () => {
  const errorDetails = { sharingId: String(fixture.id), status: 200 };

  assert.throws(() => normalizeSharingDetail({ id: fixture.id, title: fixture.title }, errorDetails), {
    code: 'SHARING_NOT_FOUND',
    message: 'unexpected sharing-detail response',
    details: errorDetails,
  });
});
