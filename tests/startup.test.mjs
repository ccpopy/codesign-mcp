import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configUrl = pathToFileURL(resolve(packageRoot, 'dist/config.js')).href;
const loggerUrl = pathToFileURL(resolve(packageRoot, 'dist/logger.js')).href;
const serverUrl = pathToFileURL(resolve(packageRoot, 'dist/server.js')).href;

function runStartupProbe(envPatch) {
  const env = { ...process.env, ...envPatch };
  for (const [key, value] of Object.entries(envPatch)) {
    if (value === undefined) delete env[key];
  }
  const script = `
    import { existsSync } from 'node:fs';
    import { config } from ${JSON.stringify(configUrl)};
    import { getLogger } from ${JSON.stringify(loggerUrl)};
    import { buildServer } from ${JSON.stringify(serverUrl)};
    buildServer();
    getLogger().info('startup probe');
    console.log(JSON.stringify({
      dataDir: config.dataDir,
      logFile: config.logFile,
      dataDirExists: existsSync(config.dataDir),
      logFileExists: existsSync(config.logFile)
    }));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: packageRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

test('server startup does not create the default runtime directory', () => {
  const workspace = mkdtempSync(resolve(tmpdir(), 'codesign-mcp-startup-'));
  try {
    const result = runStartupProbe({
      CODESIGN_WORKSPACE_DIR: workspace,
      CODESIGN_DATA_DIR: undefined,
      CODESIGN_LOG_FILE: undefined,
    });
    assert.equal(result.dataDir, resolve(workspace, '.codesign-mcp'));
    assert.equal(result.dataDirExists, false);
    assert.equal(result.logFileExists, false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
