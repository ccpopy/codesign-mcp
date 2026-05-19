import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { browserManager } from '../browser/manager.js';
import { getSharingDetail } from '../codesign/sharing.js';
import { CodesignError, isCodesignError } from '../codesign/errors.js';
import { parseSharingId } from '../utils/url.js';
import { getLogger } from '../logger.js';

const log = getLogger();

const inputSchema = {
  sharingUrl: z.string().min(1).describe('CoDesign sharing URL (https://codesign.qq.com/app/s/<id>) or bare sharing id'),
  password: z.string().optional().describe('Sharing password if required'),
} as const;

export function registerArtboardsTool(server: McpServer): void {
  server.registerTool(
    'list_artboards',
    {
      title: 'List CoDesign Artboards',
      description:
        'Use this first when a task contains a CoDesign sharing URL or asks to implement/recreate a CoDesign design. ' +
        'It resolves the official CoDesign sharing data into designs and screens with id, object_id, name, size, image URLs, meta_url, and slices_url. ' +
        'For design-to-code work, select a screen from this result before calling get_artboard_spec. Do not infer screens by cropping preview images.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ sharingUrl, password }) => {
      let sharingId: string;
      try {
        sharingId = parseSharingId(sharingUrl);
      } catch (err) {
        return errorResult(err);
      }

      const call = await browserManager.acquireHeadless();
      try {
        const { detail, stateKey } = await getSharingDetail(call.page, sharingId, password);
        const designs = (detail.designs ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          screens: (d.screens ?? []).map((s) => ({
            id: s.id,
            objectId: s.object_id,
            name: s.name,
            width: s.width,
            height: s.height,
            frame: s.frame,
            slicesCount: s.slices_count,
            metaUrl: s.meta_url,
            slicesUrl: s.slices_url,
            image: s.image && {
              url: s.image.url,
              coverUrl: s.image.cover_url,
              slicesBaseUrl: s.image.slices_base_url,
              width: s.image.width,
              height: s.image.height,
              mime: s.image.mime,
              size: s.image.size,
            },
          })),
        }));
        const totalScreens = designs.reduce((acc, d) => acc + d.screens.length, 0);
        return successResult({
          sharingId,
          title: detail.title,
          designCount: designs.length,
          screenCount: totalScreens,
          designs,
          stateKey: stateKey ? '<acquired>' : null,
        });
      } catch (err) {
        log.warn({ err: errMsg(err), sharingId }, 'list_artboards failed');
        return errorResult(err);
      } finally {
        await call.done();
      }
    },
  );
}

function successResult(payload: Record<string, unknown>) {
  const structuredContent = { ok: true, ...payload };
  return {
    structuredContent,
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  };
}

export function errorResult(err: unknown) {
  if (isCodesignError(err)) {
    const structuredContent = { ok: false, error: err.toJSON() };
    return {
      isError: true,
      structuredContent,
      content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
    };
  }
  const structuredContent = { ok: false, error: { code: 'INTERNAL', message: errMsg(err) } };
  return {
    isError: true,
    structuredContent,
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
  };
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// Re-export shared error mapper for sibling tools.
export const _internalCodesignErrorTypeCheck: typeof CodesignError = CodesignError;
