import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(here, '..');
const PACKAGE_JSON_PATH = resolve(PACKAGE_ROOT, 'package.json');

type PathSource = 'CODESIGN_WORKSPACE_DIR' | 'INIT_CWD' | 'process.cwd';
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS = new Set<LogLevel>(['trace', 'debug', 'info', 'warn', 'error']);

function resolveWorkspaceRoot(): { path: string; source: PathSource } {
  if (process.env.CODESIGN_WORKSPACE_DIR) {
    return { path: resolve(process.env.CODESIGN_WORKSPACE_DIR), source: 'CODESIGN_WORKSPACE_DIR' };
  }
  if (process.env.INIT_CWD) {
    return { path: resolve(process.env.INIT_CWD), source: 'INIT_CWD' };
  }
  return { path: process.cwd(), source: 'process.cwd' };
}

function readPackageVersion(): string {
  const parsed = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error(`Invalid package version in ${PACKAGE_JSON_PATH}`);
  }
  return parsed.version;
}

const workspace = resolveWorkspaceRoot();
const WORKSPACE_ROOT = workspace.path;
const PACKAGE_VERSION = readPackageVersion();
const DATA_DIR = process.env.CODESIGN_DATA_DIR
  ? resolve(process.env.CODESIGN_DATA_DIR)
  : resolve(WORKSPACE_ROOT, '.codesign-mcp');

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const normalized = raw.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be one of 1, true, yes, on, 0, false, no, off; got ${JSON.stringify(raw)}`);
}

function envLogLevel(name: string, fallback: LogLevel): LogLevel {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  if (LOG_LEVELS.has(raw as LogLevel)) return raw as LogLevel;
  throw new Error(`${name} must be one of ${Array.from(LOG_LEVELS).join(', ')}; got ${JSON.stringify(raw)}`);
}

export const config = {
  packageRoot: PACKAGE_ROOT,
  packageVersion: PACKAGE_VERSION,
  workspaceRoot: WORKSPACE_ROOT,
  workspaceRootSource: workspace.source,
  projectRoot: WORKSPACE_ROOT,
  dataDir: DATA_DIR,
  dataDirSource: process.env.CODESIGN_DATA_DIR ? 'CODESIGN_DATA_DIR' : 'workspace-default',
  profileDir: process.env.CODESIGN_PROFILE_DIR
    ? resolve(process.env.CODESIGN_PROFILE_DIR)
    : resolve(DATA_DIR, 'profile'),
  artifactsDir: process.env.CODESIGN_ARTIFACTS_DIR
    ? resolve(process.env.CODESIGN_ARTIFACTS_DIR)
    : resolve(DATA_DIR, 'artifacts'),
  logFile: process.env.CODESIGN_LOG_FILE
    ? resolve(process.env.CODESIGN_LOG_FILE)
    : resolve(DATA_DIR, 'codesign-mcp.log'),
  logLevel: envLogLevel('CODESIGN_LOG_LEVEL', 'info'),
  idleMs: envInt('CODESIGN_IDLE_MS', 10 * 60 * 1000),
  keepBrowser: envBool('CODESIGN_KEEP_BROWSER', false),
  origin: 'https://codesign.qq.com',
  homePath: '/app/design',
  cdnHostPattern: /^https:\/\/cdn\d?\.codesign\.qq\.com\//,
  navTimeoutMs: envInt('CODESIGN_NAV_TIMEOUT_MS', 30_000),
  apiTimeoutMs: envInt('CODESIGN_API_TIMEOUT_MS', 20_000),
  metaTimeoutMs: envInt('CODESIGN_META_TIMEOUT_MS', 30_000),
} as const;

export type Config = typeof config;
