import { test } from 'node:test';
import assert from 'node:assert/strict';

import { redactHeaderValue, redactUrl, topLevelKeys } from '../dist/utils/redact.js';

test('redactUrl redacts sensitive query values while preserving parameter names', () => {
  assert.equal(
    redactUrl('https://codesign.qq.com/app/s/664760772073604?password=secret&state-key=abc'),
    'https://codesign.qq.com/app/s/SHARING_ID?password=<redacted>&state-key=<redacted>',
  );
  assert.equal(
    redactUrl('https://codesign.qq.com/s/664760772073604?password=secret'),
    'https://codesign.qq.com/s/SHARING_ID?password=<redacted>',
  );
});

test('redactUrl redacts CDN path tokens and query-only secrets', () => {
  assert.equal(
    redactUrl(
      'https://cdn4.codesign.qq.com/screen-slices/2026/04/01/token-a/token-b/slice.png?sign=secret&raw-token',
    ),
    'https://cdn4.codesign.qq.com/screen-slices/2026/04/01/<redacted>.png?sign=<redacted>&<redacted-query>',
  );
});

test('redactUrl preserves API shape while redacting account identifiers', () => {
  assert.equal(
    redactUrl('https://codesign.qq.com/api/users/424569448504523/teams?team_id=424569505132683'),
    'https://codesign.qq.com/api/users/USER_ID/teams?team_id=<redacted>',
  );
  assert.equal(
    redactUrl('https://codesign.qq.com/api/teams/424569505132683/state-tags'),
    'https://codesign.qq.com/api/teams/TEAM_ID/state-tags',
  );
});

test('redactHeaderValue redacts account identifier headers', () => {
  assert.equal(redactHeaderValue('x-team-id', '424569505132683'), '<redacted>');
  assert.equal(redactHeaderValue('x-corp-id', '424569505132683'), '<redacted>');
  assert.equal(
    redactHeaderValue('referer', 'https://codesign.qq.com/api/users/424569448504523/teams'),
    'https://codesign.qq.com/api/users/USER_ID/teams',
  );
});

test('topLevelKeys honors requested nested key depth', () => {
  assert.deepEqual(
    topLevelKeys({ a: { b: { c: 1 } }, d: 2 }, 0),
    ['a', 'd'],
  );
  assert.deepEqual(
    topLevelKeys({ a: { b: { c: 1 } }, d: 2 }, 2),
    ['a', 'a.b', 'a.b.c', 'd'],
  );
});
