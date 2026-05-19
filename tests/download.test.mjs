import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../dist/config.js';
import { downloadToArtifact } from '../dist/utils/download.js';

const testSubdir = `download-test-${process.pid}`;
const testRoot = resolve(config.artifactsDir, testSubdir);

after(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

test('downloadToArtifact reuses an existing artifact when expectedBytes matches', async () => {
  const subdir = `${testSubdir}/reuse`;
  const dir = resolve(config.artifactsDir, subdir);
  const target = resolve(dir, 'asset.bin');
  mkdirSync(dir, { recursive: true });
  writeFileSync(target, 'keep');

  const request = fakeRequest('must-not-fetch');
  const result = await downloadToArtifact(
    'https://example.test/asset.bin',
    subdir,
    'asset.bin',
    'SLICE_FETCH_FAILED',
    { request, expectedBytes: 4 },
  );

  assert.equal(request.calls(), 0);
  assert.equal(result.path, target);
  assert.equal(result.bytes, 4);
  assert.equal(result.reusedExisting, true);
  assert.equal(result.writeAttempts, 0);
  assert.equal(readFileSync(target, 'utf8'), 'keep');
});

test('downloadToArtifact overwrites an existing artifact when expectedBytes differs', async () => {
  const subdir = `${testSubdir}/overwrite`;
  const dir = resolve(config.artifactsDir, subdir);
  const target = resolve(dir, 'asset.bin');
  mkdirSync(dir, { recursive: true });
  writeFileSync(target, 'old');

  const request = fakeRequest('new!');
  const result = await downloadToArtifact(
    'https://example.test/asset.bin',
    subdir,
    'asset.bin',
    'SLICE_FETCH_FAILED',
    { request, expectedBytes: 4 },
  );

  assert.equal(request.calls(), 1);
  assert.equal(result.path, target);
  assert.equal(result.bytes, 4);
  assert.equal(result.reusedExisting, undefined);
  assert.equal(result.writeAttempts, 1);
  assert.equal(readFileSync(target, 'utf8'), 'new!');
});

function fakeRequest(body) {
  let callCount = 0;
  return {
    calls() {
      return callCount;
    },
    async get() {
      callCount += 1;
      return {
        ok: () => true,
        status: () => 200,
        headers: () => ({ 'content-type': 'application/octet-stream' }),
        body: async () => Buffer.from(body),
      };
    },
  };
}
