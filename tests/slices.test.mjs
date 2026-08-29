// Slice manifest 解析测试 — 直接调 validate + findSliceByObjectId（纯函数部分）
// fetchSliceManifest 内部调 fetchMetaJson 涉及网络，这里只测 validate 路径。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findSliceByObjectId } from '../dist/codesign/slices.js';
import { CodesignError } from '../dist/codesign/errors.js';
import { encodeFilenameComponent } from '../dist/utils/filename.js';

const fixture = JSON.parse(
  readFileSync(resolve('tests/fixtures/meta-slice-manifest.json'), 'utf8'),
);
const manifest = fixture.sample.response.body;

test('slice manifest is a non-empty array', () => {
  assert.ok(Array.isArray(manifest));
  assert.ok(manifest.length > 0);
});

test('every item has object_id, rect, and exportables[]', () => {
  for (const item of manifest) {
    assert.equal(typeof item.object_id, 'string');
    assert.ok(item.rect && typeof item.rect === 'object');
    assert.ok(Array.isArray(item.exportables));
  }
});

test('every exportable has screenshot.url', () => {
  for (const item of manifest) {
    for (const e of item.exportables) {
      assert.ok(e.screenshot, `expected screenshot on exportable in ${item.object_id}`);
      assert.equal(typeof e.screenshot.url, 'string');
    }
  }
});

test('findSliceByObjectId finds a known slice', () => {
  const known = manifest[0];
  const found = findSliceByObjectId(manifest, known.object_id);
  assert.equal(found?.object_id, known.object_id);
});

test('findSliceByObjectId returns undefined for unknown id', () => {
  const found = findSliceByObjectId(manifest, 'nonexistent');
  assert.equal(found, undefined);
});

// 至少确认错误码存在（用作集成时的合同）
test('CodesignError code SLICE_NOT_FOUND is defined', () => {
  const e = new CodesignError('SLICE_NOT_FOUND', 'x');
  assert.equal(e.code, 'SLICE_NOT_FOUND');
});

test('encodeFilenameComponent preserves UUID-style object ids', () => {
  const objectId = 'E7D4FD1B-B4B6-4185-918A-A51B52CF6D7F';
  assert.equal(encodeFilenameComponent(objectId), objectId);
});

test('encodeFilenameComponent makes Figma-style object ids Windows-safe', () => {
  const objectId = 'I421:26229;317:1576;318:1517;14:1481';
  const encoded = encodeFilenameComponent(objectId);

  assert.equal(encoded, 'I421%3A26229%3B317%3A1576%3B318%3A1517%3B14%3A1481');
  assert.doesNotMatch(encoded, /[<>:"/\\|?*\u0000-\u001f]/);
});

test('encodeFilenameComponent does not collide with already percent-encoded ids', () => {
  assert.notEqual(encodeFilenameComponent('node:id'), encodeFilenameComponent('node%3Aid'));
});
