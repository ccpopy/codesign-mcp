import { McpServer, StdioServerTransport } from './mcp/server.js';
import { registerStatusTool } from './tools/status.js';
import { registerLoginTool } from './tools/login.js';
import { registerArtboardsTool } from './tools/artboards.js';
import { registerSpecTool } from './tools/spec.js';
import { registerImageTool } from './tools/image.js';
import { registerSlicesTool } from './tools/slices.js';
import { registerDiagnosticsTool } from './tools/diagnostics.js';
import { registerDesignToCodePrompt } from './prompts/design-to-code.js';
import { registerWorkflowResource } from './resources/workflow.js';
import { getLogger } from './logger.js';
import { browserManager } from './browser/manager.js';
import { config } from './config.js';

const log = getLogger();

export function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: 'codesign-mcp',
      version: config.packageVersion,
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
        logging: {},
      },
    },
  );

  registerStatusTool(server);
  registerLoginTool(server);
  registerArtboardsTool(server);
  registerSpecTool(server);
  registerImageTool(server);
  registerSlicesTool(server);
  registerDiagnosticsTool(server);
  registerDesignToCodePrompt(server);
  registerWorkflowResource(server);

  return server;
}

export async function startStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  log.info('starting stdio MCP server');
  await server.connect(transport);

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'received signal, shutting down');
    try {
      await browserManager.shutdown(`signal:${signal}`);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'browser shutdown failed');
    }
    try {
      await server.close();
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'server.close failed');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
