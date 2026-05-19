import { rmSync, existsSync } from 'node:fs';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import { getLogger } from '../logger.js';
import { browserManager } from '../browser/manager.js';
import { probeLoggedIn, waitForLogin } from '../browser/session.js';

const log = getLogger();

const loginInputSchema = {
  waitMs: z.number().int().min(10_000).max(20 * 60 * 1000).optional()
    .describe('Max wait time for the user to finish scanning. Defaults to 10 min.'),
} as const;

export function registerLoginTool(server: McpServer): void {
  server.registerTool(
    'codesign_login',
    {
      title: 'CoDesign Login',
      description:
        'Open a visible Chromium window pointed at codesign.qq.com so the user can scan-login. ' +
        'If already logged in, returns immediately without opening a window. ' +
        'The session is persisted under profileDir and reused by subsequent tools.',
      inputSchema: loginInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ waitMs }) => {
      // 1) 先尝试 headless 静默 probe
      log.info('login: probing existing session (headless)');
      const headless = await browserManager.acquireHeadless();
      try {
        const probe = await probeLoggedIn(headless.page);
        if (probe.loggedIn) {
          return ok({
            stage: 'already-logged-in',
            user: probe.user,
            profileDir: config.profileDir,
          });
        }
      } finally {
        await headless.done();
      }

      // 2) 静默未登录 → 打开 headed 窗口
      log.info('login: opening headed window for QR scan');
      const headed = await browserManager.acquireHeaded();
      try {
        await headed.page.goto(`${config.origin}${config.homePath}`, {
          waitUntil: 'domcontentloaded',
          timeout: config.navTimeoutMs,
        });
        const result = await waitForLogin(headed.page, {
          timeoutMs: waitMs ?? 10 * 60 * 1000,
          pollMs: 2000,
        });
        if (!result.loggedIn) {
          return fail({
            stage: 'timeout-or-cancelled',
            lastStatus: result.status,
            profileDir: config.profileDir,
            hint: 'Re-run codesign_login. The browser window will reopen.',
          });
        }
        return ok({
          stage: 'just-logged-in',
          user: result.user,
          profileDir: config.profileDir,
        });
      } finally {
        await headed.done();
      }
    },
  );

  const logoutInputSchema = {
    confirm: z.literal(true).describe('Must be true. Wipes the persistent profile.'),
  } as const;

  server.registerTool(
    'codesign_logout',
    {
      title: 'CoDesign Logout',
      description:
        'Close any running browser and wipe the persistent profile directory. ' +
        'Pass { confirm: true }. The target path is included in the result so the caller can verify before re-running.',
      inputSchema: logoutInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ confirm }) => {
      if (!confirm) {
        return fail({ stage: 'no-confirm', profileDir: config.profileDir });
      }
      await browserManager.shutdown('logout');
      const existed = existsSync(config.profileDir);
      if (existed) {
        try {
          rmSync(config.profileDir, { recursive: true, force: true });
        } catch (err) {
          log.warn({ err: (err as Error).message }, 'failed to remove profileDir');
          return fail({
            stage: 'rm-failed',
            profileDir: config.profileDir,
            error: (err as Error).message,
          });
        }
      }
      return ok({ stage: 'cleared', profileDir: config.profileDir, hadProfile: existed });
    },
  );
}

function ok(payload: Record<string, unknown>) {
  const structuredContent = { ok: true, ...payload };
  return {
    structuredContent,
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  };
}

function fail(payload: Record<string, unknown>) {
  const structuredContent = { ok: false, ...payload };
  return {
    isError: true,
    structuredContent,
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  };
}
