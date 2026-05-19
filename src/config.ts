import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(here, '..');

type PathSource = 'CODESIGN_WORKSPACE_DIR' | 'INIT_CWD' | 'process.cwd';

function resolveWorkspaceRoot(): { path: string; source: PathSource } {
  if (process.env.CODESIGN_WORKSPACE_DIR) {
    return { path: resolve(process.env.CODESIGN_WORKSPACE_DIR), source: 'CODESIGN_WORKSPACE_DIR' };
  }
  if (process.env.INIT_CWD) {
    return { path: resolve(process.env.INIT_CWD), source: 'INIT_CWD' };
  }
  return { path: process.cwd(), source: 'process.cwd' };
}

const workspace = resolveWorkspaceRoot();
const WORKSPACE_ROOT = workspace.path;
const DATA_DIR = process.env.CODESIGN_DATA_DIR
  ? resolve(process.env.CODESIGN_DATA_DIR)
  : resolve(WORKSPACE_ROOT, '.codesign-mcp');

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export const config = {
  packageRoot: PACKAGE_ROOT,
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
  logLevel: (process.env.CODESIGN_LOG_LEVEL ?? 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error',
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
