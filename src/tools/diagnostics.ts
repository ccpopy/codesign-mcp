import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Page, Request, Response } from 'playwright';
import { browserManager } from '../browser/manager.js';
import { getSharingDetail } from '../codesign/sharing.js';
import { parseSharingId } from '../utils/url.js';
import { redactUrl, redactHeaderValue, topLevelKeys, isSensitiveHeader } from '../utils/redact.js';
import { errorResult } from './artboards.js';
import { getLogger } from '../logger.js';
import { config } from '../config.js';

const log = getLogger();

interface NetworkRecord {
  startedAt: number;
  url: string;
  method: string;
  status: number | null;
  mimeType: string | null;
  size: number | null;
  durationMs: number | null;
  requestHeaders: Array<{ name: string; value: string }>;
  responseHeaders: Array<{ name: string; value: string }>;
  bodyTopKeys: string[] | null;
  bodyKind: 'object' | 'array' | 'text' | 'binary' | 'empty' | 'parse-error';
  errorMessage?: string;
}

const inputSchema = {
  sharingUrl: z.string().min(1),
  password: z.string().optional(),
  timeoutMs: z.number().int().min(1_000).max(60_000).optional().default(15_000),
  includeHeaders: z.boolean().optional().default(false),
  maxBodyKeyDepth: z.number().int().min(0).max(3).optional().default(0),
} as const;

export function registerDiagnosticsTool(server: McpServer): void {
  server.registerTool(
    'debug_collect_network',
    {
      title: 'Collect CoDesign Network (Diagnostics)',
      description:
        'Open the sharing page in a headless browser, record all network responses for `timeoutMs`, and return a REDACTED summary. ' +
        'Use this to discover unknown endpoints or to debug why a tool fails. ' +
        'Output never contains Cookie, Authorization, password, state-key values, or response bodies — only top-level JSON keys.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      const { sharingUrl, password, timeoutMs, includeHeaders } = args;
      let sharingId: string;
      try {
        sharingId = parseSharingId(sharingUrl);
      } catch (err) {
        return errorResult(err);
      }

      const call = await browserManager.acquireHeadless();
      const records = new Map<Request, NetworkRecord>();
      const finishedResponses: NetworkRecord[] = [];

      const onRequest = (req: Request) => {
        records.set(req, {
          startedAt: Date.now(),
          url: redactUrl(req.url()),
          method: req.method(),
          status: null,
          mimeType: null,
          size: null,
          durationMs: null,
          requestHeaders: includeHeaders ? headersToList(req.headers()) : [],
          responseHeaders: [],
          bodyTopKeys: null,
          bodyKind: 'empty',
        });
      };

      const onResponse = async (resp: Response) => {
        const req = resp.request();
        const rec = records.get(req);
        const now = Date.now();
        const status = resp.status();
        const mime = resp.headers()['content-type'] ?? null;
        const headersList = includeHeaders ? headersToList(resp.headers()) : [];

        let bodyKind: NetworkRecord['bodyKind'] = 'empty';
        let bodyTopKeys: string[] | null = null;
        let size: number | null = null;
        try {
          if (mime && mime.includes('json')) {
            const text = await resp.text();
            size = text.length;
            try {
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed)) {
                bodyKind = 'array';
                bodyTopKeys = parsed.length > 0 ? topLevelKeys(parsed[0]) : [];
              } else if (parsed && typeof parsed === 'object') {
                bodyKind = 'object';
                bodyTopKeys = topLevelKeys(parsed);
              } else {
                bodyKind = 'text';
              }
            } catch {
              bodyKind = 'parse-error';
            }
          } else if (mime && mime.startsWith('text/')) {
            const text = await resp.text();
            size = text.length;
            bodyKind = 'text';
          } else {
            // 二进制、不读 body 内容（避免大流量）
            bodyKind = 'binary';
          }
        } catch (err) {
          rec && (rec.errorMessage = (err as Error).message);
        }

        const merged: NetworkRecord = {
          startedAt: rec?.startedAt ?? now,
          url: redactUrl(resp.url()),
          method: resp.request().method(),
          status,
          mimeType: mime,
          size,
          durationMs: rec ? now - rec.startedAt : null,
          requestHeaders: rec?.requestHeaders ?? [],
          responseHeaders: headersList,
          bodyTopKeys,
          bodyKind,
        };
        if (rec?.errorMessage) merged.errorMessage = rec.errorMessage;
        finishedResponses.push(merged);
        records.delete(req);
      };

      const onResponseEvent = (resp: Response) => {
        void onResponse(resp);
      };

      call.page.on('request', onRequest);
      call.page.on('response', onResponseEvent);

      const detach = () => {
        call.page.off('request', onRequest);
        call.page.off('response', onResponseEvent);
      };

      try {
        // 导航 + 必要时密码换 key，复用同一 page
        const page: Page = call.page;
        await page.goto(`${config.origin}/app/s/${sharingId}`, {
          waitUntil: 'domcontentloaded',
          timeout: config.navTimeoutMs,
        });
        if (password) {
          try {
            await getSharingDetail(page, sharingId, password);
          } catch (err) {
            log.warn({ err: (err as Error).message }, 'diagnostic sharing fetch warned');
          }
        }
        // 静置等待，让前端继续触发请求
        await new Promise((r) => setTimeout(r, timeoutMs));

        const summary = summarizeRecords(finishedResponses);

        return ok({
          sharingId,
          timeoutMs,
          recordedCount: finishedResponses.length,
          inFlightAtEnd: records.size,
          ...summary,
        });
      } catch (err) {
        log.warn({ err: errMsg(err), sharingId }, 'debug_collect_network failed');
        return errorResult(err);
      } finally {
        detach();
        await call.done();
      }
    },
  );
}

function headersToList(h: Record<string, string>): Array<{ name: string; value: string }> {
  return Object.entries(h).map(([name, value]) => ({
    name,
    value: isSensitiveHeader(name) ? '<redacted>' : redactHeaderValue(name, value),
  }));
}

function summarizeRecords(records: NetworkRecord[]): {
  records: NetworkRecord[];
  byHost: Array<{ host: string; count: number }>;
  byStatus: Array<{ status: number | 'unknown'; count: number }>;
} {
  const hostMap = new Map<string, number>();
  const statusMap = new Map<number | 'unknown', number>();
  for (const r of records) {
    let host = '<unknown>';
    try {
      host = new URL(r.url).host;
    } catch {
      /* ignore */
    }
    hostMap.set(host, (hostMap.get(host) ?? 0) + 1);
    const key: number | 'unknown' = r.status ?? 'unknown';
    statusMap.set(key, (statusMap.get(key) ?? 0) + 1);
  }
  return {
    records,
    byHost: Array.from(hostMap.entries()).map(([host, count]) => ({ host, count })),
    byStatus: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
  };
}

function ok(payload: Record<string, unknown>) {
  const structuredContent = { ok: true, ...payload };
  return {
    structuredContent,
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  };
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
