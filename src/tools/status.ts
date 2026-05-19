import { existsSync, statSync } from 'node:fs';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import { browserManager } from '../browser/manager.js';

const inputSchema = {} as const;

export function registerStatusTool(server: McpServer): void {
  server.registerTool(
    'codesign_status',
    {
      title: 'CoDesign Status',
      description:
        'Return MCP server config (profile path, idle settings) and current browser/login status. ' +
        'Use this first to verify whether the user has logged in.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const profileExists = existsSync(config.profileDir);
      let profileSize = 0;
      try {
        if (profileExists) profileSize = statSync(config.profileDir).size;
      } catch {
        /* ignore */
      }

      const browser = browserManager.snapshot();

      const status = {
        version: '0.1.0',
        config: {
          packageRoot: config.packageRoot,
          workspaceRoot: config.workspaceRoot,
          workspaceRootSource: config.workspaceRootSource,
          dataDir: config.dataDir,
          dataDirSource: config.dataDirSource,
          profileDir: config.profileDir,
          artifactsDir: config.artifactsDir,
          idleMs: config.idleMs,
          keepBrowser: config.keepBrowser,
        },
        profile: {
          exists: profileExists,
          byteSize: profileSize,
        },
        browser,
        notes:
          'Runtime files default to <workspaceRoot>/.codesign-mcp. Login state is persisted in profileDir. CoDesign design-to-code tasks should use list_artboards, get_artboard_spec, and download_slice instead of cropping preview screenshots.',
      };

      return {
        structuredContent: status,
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    },
  );
}

// 类型导出便于客户端/测试引用
export type StatusInput = z.infer<z.ZodObject<typeof inputSchema>>;
