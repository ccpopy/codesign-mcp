import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

export interface Logger {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

type LogMethod = (...args: unknown[]) => void;
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

let _logger: Logger | undefined;

export function getLogger(): Logger {
  if (_logger) return _logger;
  _logger = createFileLogger();
  return _logger;
}

function createFileLogger(): Logger {
  return {
    trace: (...args) => writeLog('trace', args),
    debug: (...args) => writeLog('debug', args),
    info: (...args) => writeLog('info', args),
    warn: (...args) => writeLog('warn', args),
    error: (...args) => writeLog('error', args),
  };
}

function writeLog(level: LogLevel, args: unknown[]): void {
  if (LEVEL_SEVERITY[level] < LEVEL_SEVERITY[config.logLevel]) return;
  const entry = normalizeLogEntry(level, args);
  const logDir = dirname(config.logFile);
  if (config.logFileSource === 'CODESIGN_LOG_FILE' || existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(config.logFile, `${JSON.stringify(entry)}\n`, 'utf8');
    return;
  }
  process.stderr.write(`${JSON.stringify(entry)}\n`);
}

function normalizeLogEntry(level: LogLevel, args: unknown[]): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    name: 'codesign-mcp',
  };

  if (args.length === 0) return entry;
  const [first, second, ...rest] = args;
  if (isPlainRecord(first)) {
    Object.assign(entry, first);
    if (typeof second === 'string') entry.msg = second;
    if (rest.length > 0) entry.args = rest.map(stringifyArg);
    return entry;
  }

  entry.msg = args.map(stringifyArg).join(' ');
  return entry;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function stringifyArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  return JSON.stringify(value);
}
