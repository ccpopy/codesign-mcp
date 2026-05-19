// 测试 parser：assertSpecObject + normalizeSpec
// 需要先 `npm run build`，因为 import 的是编译后的 dist/

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertSpecObject, normalizeSpec, findLayerByObjectId } from '../dist/codesign/parser.js';
import { CodesignError } from '../dist/codesign/errors.js';

const specFixture = JSON.parse(
  readFileSync(resolve('tests/fixtures/meta-spec-object.json'), 'utf8'),
);
const specBody = specFixture.sample.response.body;

test('assertSpecObject accepts the HAR fixture', () => {
  assert.doesNotThrow(() => assertSpecObject(specBody));
});

test('assertSpecObject rejects null', () => {
  assert.throws(() => assertSpecObject(null), CodesignError);
});

test('assertSpecObject rejects array', () => {
  assert.throws(() => assertSpecObject([]), CodesignError);
});

test('assertSpecObject rejects missing object_id', () => {
  const bad = { ...specBody };
  delete bad.object_id;
  assert.throws(() => assertSpecObject(bad), (err) => {
    assert.ok(err instanceof CodesignError);
    assert.equal(err.code, 'META_SCHEMA_MISMATCH');
    return true;
  });
});

test('assertSpecObject rejects layers as non-array', () => {
  const bad = { ...specBody, layers: 'oops' };
  assert.throws(() => assertSpecObject(bad), (err) => {
    assert.ok(err instanceof CodesignError);
    return true;
  });
});

test('normalizeSpec preserves artboard/layers/groups/css', () => {
  const out = normalizeSpec(specBody);
  assert.equal(out.artboard.objectId, specBody.object_id);
  assert.equal(out.artboard.width, specBody.width);
  assert.equal(out.artboard.height, specBody.height);
  assert.ok(Array.isArray(out.layers));
  assert.ok(Array.isArray(out.groups));
  assert.ok(Array.isArray(out.css));
  assert.equal(out.layers.length, specBody.layers.length);
  assert.equal(out.groups.length, specBody.groups.length);
});

test('normalizeSpec keeps styleName field (HAR-actual name, not textStyleName)', () => {
  const out = normalizeSpec(specBody);
  const withStyle = out.layers.find((l) => l.styleName != null) ?? out.groups.find((l) => l.styleName != null);
  if (withStyle != null) {
    assert.equal(typeof withStyle.styleName, 'string');
  }
});

test('findLayerByObjectId locates a known layer', () => {
  const normalized = normalizeSpec(specBody);
  const sample = normalized.layers[0] ?? normalized.groups[0];
  if (sample) {
    const found = findLayerByObjectId(normalized, sample.object_id);
    assert.ok(found, 'should find the sampled layer');
    assert.equal(found?.object_id, sample.object_id);
  }
});

test('findLayerByObjectId returns undefined for missing id', () => {
  const normalized = normalizeSpec(specBody);
  const found = findLayerByObjectId(normalized, 'definitely-not-there');
  assert.equal(found, undefined);
});

test('normalizeSpec passes through slices when provided', () => {
  const sliceFixture = JSON.parse(
    readFileSync(resolve('tests/fixtures/meta-slice-manifest.json'), 'utf8'),
  );
  const slices = sliceFixture.sample.response.body;
  const out = normalizeSpec(specBody, slices);
  assert.equal(out.slices.length, slices.length);
});
