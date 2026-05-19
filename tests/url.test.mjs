import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSharingId, getSharingPageUrl } from '../dist/utils/url.js';
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
