import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSharingId, getSharingPageUrl, normalizeCodesignAssetUrl } from '../dist/utils/url.js';
import { CodesignError } from '../dist/codesign/errors.js';

test('parses bare numeric id', () => {
  assert.equal(parseSharingId('664760772073604'), '664760772073604');
});

test('parses /app/s/<id> URL', () => {
  assert.equal(parseSharingId('https://codesign.qq.com/app/s/664760772073604'), '664760772073604');
});

test('parses /s/<id> URL (short form)', () => {
  assert.equal(parseSharingId('https://codesign.qq.com/s/664760772073604'), '664760772073604');
});

test('parses URL with trailing slash', () => {
  assert.equal(parseSharingId('https://codesign.qq.com/app/s/664760772073604/'), '664760772073604');
});

test('parses URL with query string', () => {
  assert.equal(
    parseSharingId('https://codesign.qq.com/app/s/664760772073604?foo=bar'),
    '664760772073604',
  );
});

test('throws on empty input', () => {
  assert.throws(() => parseSharingId(''), CodesignError);
});

test('throws on garbage', () => {
  assert.throws(() => parseSharingId('not a url'), (err) => {
    assert.ok(err instanceof CodesignError);
    assert.equal(err.code, 'INVALID_SHARING_URL');
    return true;
  });
});

test('throws on URL without /s/<id> path', () => {
  assert.throws(() => parseSharingId('https://codesign.qq.com/app/design'), (err) => {
    assert.ok(err instanceof CodesignError);
    assert.equal(err.code, 'INVALID_SHARING_URL');
    return true;
  });
});

test('getSharingPageUrl uses configured origin', () => {
  assert.equal(getSharingPageUrl('12345678'), 'https://codesign.qq.com/app/s/12345678');
});

test('normalizeCodesignAssetUrl rewrites CoDesign COS slice URLs to CDN', () => {
  assert.equal(
    normalizeCodesignAssetUrl(
      'https://codesign-1258344699.cos.accelerate.myqcloud.com/screen-slices/2026/04/01/token/path/slice.png',
    ),
    'https://cdn4.codesign.qq.com/screen-slices/2026/04/01/token/path/slice.png',
  );
});

test('normalizeCodesignAssetUrl keeps query strings on rewritten slice URLs', () => {
  assert.equal(
    normalizeCodesignAssetUrl(
      'https://codesign-1258344699.cos.accelerate.myqcloud.com/screen-slices/2026/04/01/token/path/slice.png?imageMogr2/format/png',
    ),
    'https://cdn4.codesign.qq.com/screen-slices/2026/04/01/token/path/slice.png?imageMogr2/format/png',
  );
});

test('normalizeCodesignAssetUrl leaves unrelated URLs unchanged', () => {
  const url = 'https://cdn4.codesign.qq.com/meta/2026/04/01/token/spec.json';
  assert.equal(normalizeCodesignAssetUrl(url), url);
});
