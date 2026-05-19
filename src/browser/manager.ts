// 浏览器单例 + lazy-launch + idle shutdown。
// M2 会进一步实装 launch/close。本文件先暴露 snapshot 给 codesign_status。

import type { BrowserContext, Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { config } from '../config.js';
import { getLogger } from '../logger.js';

const log = getLogger();

type LaunchMode = 'headless' | 'headed';

interface ManagerState {
  context: BrowserContext | null;
  mode: LaunchMode | null;
  activeCalls: number;
  lastUsedAt: number;
  idleTimer: NodeJS.Timeout | null;
  launchedAt: number | null;
}

const state: ManagerState = {
  context: null,
  mode: null,
  activeCalls: 0,
  lastUsedAt: 0,
  idleTimer: null,
  launchedAt: null,
};

function clearIdle(): void {
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
}

function scheduleIdleShutdown(): void {
  clearIdle();
  if (config.keepBrowser) return;
  if (!state.context) return;
  state.idleTimer = setTimeout(() => {
    if (state.activeCalls > 0) return;
    void shutdown('idle');
  }, config.idleMs);
}

async function launch(mode: LaunchMode): Promise<BrowserContext> {
  mkdirSync(config.profileDir, { recursive: true });
  log.info({ mode, profileDir: config.profileDir }, 'launching persistent context');
  const ctx = await chromium.launchPersistentContext(config.profileDir, {
    headless: mode === 'headless',
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  state.context = ctx;
  state.mode = mode;
  state.launchedAt = Date.now();
  ctx.on('close', () => {
    log.info({ launchedAt: state.launchedAt }, 'context closed');
    state.context = null;
    state.mode = null;
    state.launchedAt = null;
    clearIdle();
  });
  return ctx;
}

async function ensure(mode: LaunchMode): Promise<BrowserContext> {
  if (state.context && state.mode === mode) return state.context;
  if (state.context && state.mode !== mode) {
    // 模式不一致（已 headless 但需要 headed，或反之）。关掉重开。
    await shutdown('mode-switch');
  }
  return launch(mode);
}

export async function shutdown(reason: string): Promise<void> {
  clearIdle();
  if (!state.context) return;
  log.info({ reason }, 'shutting down context');
  const ctx = state.context;
  state.context = null;
  state.mode = null;
  state.launchedAt = null;
  try {
    await ctx.close();
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'context.close failed');
  }
}

export interface BrowserCallContext {
  context: BrowserContext;
  page: Page;
  done: () => Promise<void>;
}

async function acquireCall(mode: LaunchMode): Promise<BrowserCallContext> {
  const ctx = await ensure(mode);
  state.activeCalls += 1;
  clearIdle();
  const page = await ctx.newPage();
  let released = false;
  const done = async () => {
    if (released) return;
    released = true;
    try {
      await page.close({ runBeforeUnload: false });
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'page.close failed');
    }
    state.activeCalls = Math.max(0, state.activeCalls - 1);
    state.lastUsedAt = Date.now();
    if (state.activeCalls === 0) scheduleIdleShutdown();
  };
  return { context: ctx, page, done };
}

export const browserManager = {
  acquireHeadless(): Promise<BrowserCallContext> {
    return acquireCall('headless');
  },
  acquireHeaded(): Promise<BrowserCallContext> {
    return acquireCall('headed');
  },
  shutdown,
  snapshot(): {
    running: boolean;
    mode: LaunchMode | null;
    activeCalls: number;
    lastUsedAt: number;
    launchedAt: number | null;
  } {
    return {
      running: state.context != null,
      mode: state.mode,
      activeCalls: state.activeCalls,
      lastUsedAt: state.lastUsedAt,
      launchedAt: state.launchedAt,
    };
  },
};

export type BrowserManager = typeof browserManager;
