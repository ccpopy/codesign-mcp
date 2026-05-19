import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { config } from '../dist/config.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = process.cwd();
const configUrl = pathToFileURL(resolve(packageRoot, 'dist/config.js')).href;
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));

function readConfigWithEnv(envPatch) {
  const env = { ...process.env, ...envPatch };
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) delete env[key];
  }
  const script = `import { config } from ${JSON.stringify(configUrl)}; console.log(JSON.stringify({ packageVersion: config.packageVersion, workspaceRoot: config.workspaceRoot, workspaceRootSource: config.workspaceRootSource, dataDir: config.dataDir, dataDirSource: config.dataDirSource, idleMs: config.idleMs, keepBrowser: config.keepBrowser, logLevel: config.logLevel }));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: packageRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

function readConfigFailureWithEnv(envPatch) {
  try {
    readConfigWithEnv(envPatch);
  } catch (err) {
    if (err && typeof err === 'object' && 'stderr' in err) {
      const stderr = err.stderr;
      return Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr);
    }
    return err instanceof Error ? err.message : String(err);
  }
  assert.fail('expected config import to fail');
}

test('config projectRoot points at the package root', () => {
  assert.equal(config.packageRoot, packageRoot);
});

test('config packageVersion comes from package.json', () => {
  assert.equal(config.packageVersion, packageJson.version);
});

test('config projectRoot points at the workspace root', () => {
  assert.equal(config.projectRoot, workspaceRoot);
  assert.equal(config.workspaceRoot, workspaceRoot);
  assert.match(config.workspaceRootSource, /^(INIT_CWD|process\.cwd)$/);
});

test('default data paths stay inside the workspace root', () => {
  assert.equal(config.dataDir, resolve(workspaceRoot, '.codesign-mcp'));
  assert.equal(config.profileDir, resolve(workspaceRoot, '.codesign-mcp/profile'));
  assert.equal(config.artifactsDir, resolve(workspaceRoot, '.codesign-mcp/artifacts'));
  assert.equal(config.logFile, resolve(workspaceRoot, '.codesign-mcp/codesign-mcp.log'));
});

test('CODESIGN_WORKSPACE_DIR overrides automatic workspace detection', () => {
  const explicitRoot = resolve(packageRoot, 'tmp-explicit-workspace');
  const initRoot = resolve(packageRoot, 'tmp-init-workspace');
  const childConfig = readConfigWithEnv({
    CODESIGN_WORKSPACE_DIR: explicitRoot,
    INIT_CWD: initRoot,
    CODESIGN_DATA_DIR: undefined,
  });
  assert.equal(childConfig.workspaceRoot, explicitRoot);
  assert.equal(childConfig.workspaceRootSource, 'CODESIGN_WORKSPACE_DIR');
  assert.equal(childConfig.dataDir, resolve(explicitRoot, '.codesign-mcp'));
});

test('INIT_CWD is used for npx-launched workspace detection', () => {
  const initRoot = resolve(packageRoot, 'tmp-init-workspace');
  const childConfig = readConfigWithEnv({
    CODESIGN_WORKSPACE_DIR: undefined,
    INIT_CWD: initRoot,
    CODESIGN_DATA_DIR: undefined,
  });
  assert.equal(childConfig.workspaceRoot, initRoot);
  assert.equal(childConfig.workspaceRootSource, 'INIT_CWD');
  assert.equal(childConfig.dataDirSource, 'workspace-default');
});

test('valid scalar environment variables are parsed explicitly', () => {
  const childConfig = readConfigWithEnv({
    CODESIGN_IDLE_MS: '0',
    CODESIGN_KEEP_BROWSER: 'off',
    CODESIGN_LOG_LEVEL: 'debug',
  });
  assert.equal(childConfig.idleMs, 0);
  assert.equal(childConfig.keepBrowser, false);
  assert.equal(childConfig.logLevel, 'debug');
});

test('invalid integer environment variables fail clearly', () => {
  const stderr = readConfigFailureWithEnv({ CODESIGN_IDLE_MS: 'soon' });
  assert.match(stderr, /CODESIGN_IDLE_MS/);
  assert.match(stderr, /non-negative integer/);
});

test('invalid boolean environment variables fail clearly', () => {
  const stderr = readConfigFailureWithEnv({ CODESIGN_KEEP_BROWSER: 'sometimes' });
  assert.match(stderr, /CODESIGN_KEEP_BROWSER/);
  assert.match(stderr, /must be one of/);
});

test('invalid log level environment variables fail clearly', () => {
  const stderr = readConfigFailureWithEnv({ CODESIGN_LOG_LEVEL: 'verbose' });
  assert.match(stderr, /CODESIGN_LOG_LEVEL/);
  assert.match(stderr, /trace, debug, info, warn, error/);
});
