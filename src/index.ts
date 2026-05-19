#!/usr/bin/env node
import { startStdio } from './server.js';
import { getLogger } from './logger.js';

const log = getLogger();

process.on('uncaughtException', (err) => {
  log.error({ err: err.message, stack: err.stack }, 'uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  log.error({ reason: reason instanceof Error ? reason.message : String(reason) }, 'unhandledRejection');
});

startStdio().catch((err) => {
  log.error({ err: err.message, stack: err.stack }, 'failed to start');
  // stdio MCP 协议要求 stderr 用于诊断，stdout 给协议
  process.stderr.write(`codesign-mcp failed to start: ${err.message}\n`);
  process.exit(1);
});
