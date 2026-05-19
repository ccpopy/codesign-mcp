import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pino, { type Logger } from 'pino';
import { config } from './config.js';

let _logger: Logger | undefined;

export function getLogger(): Logger {
  if (_logger) return _logger;
  mkdirSync(dirname(config.logFile), { recursive: true });
  _logger = pino(
    {
      level: config.logLevel,
      base: { name: 'codesign-mcp' },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination({ dest: config.logFile, sync: false, mkdir: true }),
  );
  return _logger;
}
