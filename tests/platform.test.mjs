import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlatformSpec,
  normalizeTargetPlatform,
  supportedTargetPlatforms,
} from '../dist/codesign/platform.js';
import { normalizeSpec } from '../dist/codesign/parser.js';
import { CodesignError } from '../dist/codesign/errors.js';

const specFixture = JSON.parse(
  readFileSync(resolve('tests/fixtures/meta-spec-object.json'), 'utf8'),
);
const specBody = specFixture.sample.response.body;

test('normalizeTargetPlatform accepts natural-language aliases', () => {
  assert.equal(normalizeTargetPlatform('Android'), 'android');
  assert.equal(normalizeTargetPlatform('安卓'), 'android');
  assert.equal(normalizeTargetPlatform('iPhone'), 'ios');
  assert.equal(normalizeTargetPlatform('微信小程序'), 'wechat-miniprogram');
  assert.equal(normalizeTargetPlatform('mini program'), 'wechat-miniprogram');
  assert.equal(normalizeTargetPlatform('网页'), 'web');
  assert.equal(normalizeTargetPlatform('原始标注'), 'raw');
});

test('normalizeTargetPlatform rejects unsupported platform names explicitly', () => {
  assert.throws(() => normalizeTargetPlatform('blackberry'), (err) => {
    assert.ok(err instanceof CodesignError);
    assert.equal(err.code, 'INVALID_PLATFORM');
    assert.match(err.message, /unsupported targetPlatform/);
    return true;
  });
});

test('buildPlatformSpec converts rect units and CSS units for Android', () => {
  const platform = buildPlatformSpec(specBody, '安卓');
  assert.equal(platform.id, 'android');
  assert.equal(platform.label, 'Android');
  assert.equal(platform.unit, 'dp');
  assert.equal(platform.artboard.unit, 'dp');
  assert.ok(platform.layers.length > 0);
  assert.equal(platform.layers[0].rect.unit, 'dp');
  const css = platform.layers.find((layer) => layer.css && layer.css.length > 0)?.css?.join('\n') ?? '';
  assert.doesNotMatch(css, /\dpx\b/);
});

test('buildPlatformSpec converts CSS units for iOS and mini program', () => {
  const ios = buildPlatformSpec(specBody, 'iOS');
  const mini = buildPlatformSpec(specBody, '小程序');
  assert.equal(ios.unit, 'pt');
  assert.equal(mini.unit, 'rpx');
  const iosCss = ios.layers.find((layer) => layer.css && layer.css.length > 0)?.css?.join('\n') ?? '';
  const miniCss = mini.layers.find((layer) => layer.css && layer.css.length > 0)?.css?.join('\n') ?? '';
  assert.match(iosCss, /\dpt\b/);
  assert.match(miniCss, /\drpx\b/);
});

test('buildPlatformSpec applies customWidth and remBasePx for rem output', () => {
  const platform = buildPlatformSpec(specBody, 'web', {
    targetUnit: 'rem',
    customWidth: 1440,
    remBasePx: 100,
  });
  assert.equal(platform.unit, 'rem');
  assert.equal(platform.conversion.mode, 'custom-width');
  assert.equal(platform.conversion.sourceWidth, specBody.width);
  assert.equal(platform.conversion.customWidth, 1440);
  assert.equal(platform.conversion.remBasePx, 100);
  assert.equal(platform.conversion.remBasePxSource, 'explicit');
  assert.equal(platform.scale, 1440 / specBody.width);

  const sourceLayer = specBody.layers.find((layer) => layer.css?.some((line) => /\d+(?:\.\d+)?px\b/.test(line)));
  const convertedLayer = platform.layers.find((layer) => layer.objectId === sourceLayer?.object_id);
  assert.ok(convertedLayer);
  const sourcePx = Number(sourceLayer?.css?.join('\n').match(/(\d+(?:\.\d+)?)px\b/)?.[1]);
  const expectedRem = Number(((sourcePx * (1440 / specBody.width)) / 100).toFixed(2));
  assert.ok(convertedLayer.css?.some((line) => line.includes(`${expectedRem}rem`)));
});

test('buildPlatformSpec applies customScale', () => {
  const platform = buildPlatformSpec(specBody, 'Android', {
    customScale: 0.5,
  });
  assert.equal(platform.unit, 'dp');
  assert.equal(platform.scale, 0.5);
  assert.equal(platform.conversion.mode, 'custom-scale');
  assert.equal(platform.conversion.customScale, 0.5);
  assert.equal(platform.artboard.width, specBody.width * 0.5);
});

test('buildPlatformSpec rejects conflicting custom conversion options', () => {
  assert.throws(() => buildPlatformSpec(specBody, 'web', { customScale: 0.75, customWidth: 1440 }), (err) => {
    assert.ok(err instanceof CodesignError);
    assert.equal(err.code, 'INVALID_PLATFORM');
    assert.match(err.message, /cannot both be set/);
    return true;
  });
});

test('buildPlatformSpec rejects unsupported target units for a platform', () => {
  assert.throws(() => buildPlatformSpec(specBody, 'Android', { targetUnit: 'rem' }), (err) => {
    assert.ok(err instanceof CodesignError);
    assert.equal(err.code, 'INVALID_PLATFORM');
    assert.match(err.message, /targetUnit/);
    return true;
  });
});

test('normalizeSpec includes platformSpec only when provided', () => {
  const raw = normalizeSpec(specBody);
  assert.equal(raw.platformSpec, undefined);

  const platform = buildPlatformSpec(specBody, 'web');
  const normalized = normalizeSpec(specBody, [], platform);
  assert.equal(normalized.platformSpec?.id, 'web');
  assert.equal(normalized.platformSpec?.unit, 'px');
});

test('supportedTargetPlatforms exposes ids and units for tool callers', () => {
  const supported = supportedTargetPlatforms();
  assert.ok(supported.some((platform) => platform.id === 'android' && platform.unit === 'dp'));
  assert.ok(supported.some((platform) => platform.id === 'wechat-miniprogram' && platform.unit === 'rpx'));
});
