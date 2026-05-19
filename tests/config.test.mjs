import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../dist/config.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = process.cwd();

test('config projectRoot points at the package root', () => {
  assert.equal(config.packageRoot, packageRoot);
});

test('config projectRoot points at the workspace root', () => {
  assert.equal(config.projectRoot, workspaceRoot);
  assert.equal(config.workspaceRoot, workspaceRoot);
});

test('default data paths stay inside the workspace root', () => {
  assert.equal(config.dataDir, resolve(workspaceRoot, '.codesign-mcp'));
  assert.equal(config.profileDir, resolve(workspaceRoot, '.codesign-mcp/profile'));
  assert.equal(config.artifactsDir, resolve(workspaceRoot, '.codesign-mcp/artifacts'));
  assert.equal(config.logFile, resolve(workspaceRoot, '.codesign-mcp/codesign-mcp.log'));
});
