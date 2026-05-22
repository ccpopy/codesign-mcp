import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loginUrl = pathToFileURL(resolve(packageRoot, 'dist/tools/login.js')).href;

function runProfileCheck(envPatch) {
  const env = { ...process.env, ...envPatch };
  const script = `
    import { assertProfileDirCanBeCleared } from ${JSON.stringify(loginUrl)};
    try {
      assertProfileDirCanBeCleared();
      console.log(JSON.stringify({ ok: true }));
    } catch (err) {
      console.log(JSON.stringify({ ok: false, code: err.code, message: err.message }));
    }
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: packageRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

test('profile deletion guard allows the default workspace runtime profile', () => {
  const workspace = resolve(packageRoot, 'tmp-safe-workspace');
  const result = runProfileCheck({
    CODESIGN_WORKSPACE_DIR: workspace,
    CODESIGN_DATA_DIR: undefined,
    CODESIGN_PROFILE_DIR: undefined,
  });
  assert.deepEqual(result, { ok: true });
});

test('profile deletion guard rejects an arbitrary profile directory', () => {
  const workspace = resolve(packageRoot, 'tmp-safe-workspace');
  const result = runProfileCheck({
    CODESIGN_WORKSPACE_DIR: workspace,
    CODESIGN_DATA_DIR: undefined,
    CODESIGN_PROFILE_DIR: resolve(packageRoot, 'outside-profile'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROFILE_DIR_UNSAFE');
});

test('profile deletion guard allows the default profile under an explicit data dir', () => {
  const workspace = resolve(packageRoot, 'tmp-safe-workspace');
  const dataDir = resolve(packageRoot, 'tmp-codesign-data');
  const result = runProfileCheck({
    CODESIGN_WORKSPACE_DIR: workspace,
    CODESIGN_DATA_DIR: dataDir,
    CODESIGN_PROFILE_DIR: undefined,
  });
  assert.deepEqual(result, { ok: true });
});

test('profile deletion guard rejects arbitrary children of a broad data dir', () => {
  const workspace = resolve(packageRoot, 'tmp-safe-workspace');
  const result = runProfileCheck({
    CODESIGN_WORKSPACE_DIR: workspace,
    CODESIGN_DATA_DIR: packageRoot,
    CODESIGN_PROFILE_DIR: resolve(packageRoot, 'src'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROFILE_DIR_UNSAFE');
});
