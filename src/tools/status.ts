import { existsSync, statSync } from 'node:fs';
import type { McpServer } from '../mcp/server.js';
import { objectSchema } from '../mcp/schema.js';
import { config } from '../config.js';
import { browserManager } from '../browser/manager.js';

const inputSchema = objectSchema({});

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
        version: config.packageVersion,
        config: {
          packageRoot: config.packageRoot,
          packageVersion: config.packageVersion,
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
          'Runtime files default to <workspaceRoot>/.codesign-mcp and are created only when a tool needs local state or artifacts. Login state is persisted in profileDir. CoDesign design-to-code tasks should use list_artboards, get_artboard_spec, and download_slice instead of cropping preview screenshots.',
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
