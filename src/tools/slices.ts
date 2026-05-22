import type { McpServer } from '../mcp/server.js';
import { objectSchema } from '../mcp/schema.js';
import { browserManager } from '../browser/manager.js';
import { getSharingDetail } from '../codesign/sharing.js';
import { fetchSliceManifest, findSliceByObjectId } from '../codesign/slices.js';
import { CodesignError } from '../codesign/errors.js';
import { normalizeCodesignAssetUrl, parseSharingId } from '../utils/url.js';
import { downloadToArtifact } from '../utils/download.js';
import { errorResult } from './artboards.js';
import { pickScreen, summarizeScreens } from './spec.js';
import { getLogger } from '../logger.js';
import type { SharingScreen, SliceExportable } from '../codesign/types.js';

const log = getLogger();

const SLICE_DOWNLOAD_HEADERS = {
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  Referer: 'https://codesign.qq.com/',
};

interface SlicesInput {
  sharingUrl: string;
  password?: string;
  screenId?: number | string;
  objectId?: string;
  screenName?: string;
  layerObjectId: string;
  format?: string;
  scales?: number[];
}

const inputSchema = objectSchema(
  {
    sharingUrl: { type: 'string', minLength: 1 },
    password: { type: 'string' },
    screenId: { anyOf: [{ type: 'integer' }, { type: 'string' }] },
    objectId: { type: 'string' },
    screenName: { type: 'string' },
    layerObjectId: {
      type: 'string',
      minLength: 1,
      description: 'object_id of the slice layer',
    },
    format: {
      type: 'string',
      description: 'Filter exportables by format (png, jpg, svg, etc.)',
    },
    scales: {
      type: 'array',
      items: { type: 'number' },
      description: 'Filter exportables by scale list, e.g. [1, 2]',
    },
  },
  ['sharingUrl', 'layerObjectId'],
);

export function registerSlicesTool(server: McpServer): void {
  server.registerTool(
    'download_slice',
    {
      title: 'Download CoDesign Slice',
      description:
        'Downloads designer-exported CoDesign slice assets from the official slice manifest, matched by layer object_id. ' +
        'Use this for implementation assets instead of using Python/PIL or screenshot cropping. ' +
        'Returns local paths under <workspaceRoot>/.codesign-mcp/artifacts/<sharingId>/slices/. Optional filters: format and scales.',
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args: SlicesInput) => {
      const { sharingUrl, password, screenId, objectId, screenName, layerObjectId, format, scales } = args;
      let sharingId: string;
      try {
        sharingId = parseSharingId(sharingUrl);
      } catch (err) {
        return errorResult(err);
      }

      const call = await browserManager.acquireHeadless();
      try {
        const { detail } = await getSharingDetail(call.page, sharingId, password);

        const allScreens: SharingScreen[] = [];
        for (const d of detail.designs ?? []) {
          for (const s of d.screens ?? []) allScreens.push(s);
        }
        if (allScreens.length === 0) {
          return errorResult(
            new CodesignError('SHARING_NOT_FOUND', 'sharing has no screens', { sharingId }),
          );
        }

        const selector = { screenId, objectId, screenName };
        const picked = pickScreen(allScreens, selector);
        if (!picked) {
          if (selector.screenId == null && !selector.objectId && !selector.screenName) {
            return errorResult(
              new CodesignError(
                'SCREEN_SELECTOR_REQUIRED',
                'multiple screens present; specify a selector',
                { available: summarizeScreens(allScreens) },
              ),
            );
          }
          return errorResult(
            new CodesignError('SCREEN_NOT_FOUND', 'no screen matches the given selector', {
              selector,
              available: summarizeScreens(allScreens),
            }),
          );
        }

        if (!picked.slices_url) {
          return errorResult(
            new CodesignError('SLICE_NOT_FOUND', 'screen has no slices_url', {
              screen: { id: picked.id, objectId: picked.object_id, name: picked.name },
            }),
          );
        }

        const manifest = await fetchSliceManifest(picked.slices_url);
        const slice = findSliceByObjectId(manifest, layerObjectId);
        if (!slice) {
          return errorResult(
            new CodesignError('SLICE_NOT_FOUND', 'no slice matches layerObjectId', {
              layerObjectId,
              availableObjectIds: manifest.map((m) => m.object_id),
            }),
          );
        }

        const filteredExportables = slice.exportables.filter((e) => acceptExportable(e, { format, scales }));
        if (filteredExportables.length === 0) {
          return errorResult(
            new CodesignError('SLICE_NOT_FOUND', 'no exportable matches the filters', {
              layerObjectId,
              filters: { format, scales },
              availableExports: slice.exportables.map((e) => ({
                format: e.format,
                scale: e.scale,
                name: e.name,
              })),
            }),
          );
        }

        const downloads: Array<{
          format?: string;
          scale?: number;
          url: string;
          downloadUrl?: string;
          path: string;
          bytes: number;
          mime: string | null;
          reusedExisting?: boolean;
        }> = [];
        for (const e of filteredExportables) {
          const url = e.screenshot?.url;
          if (!url) {
            log.warn({ exportable: e.name }, 'exportable has no screenshot.url');
            continue;
          }
          const downloadUrl = normalizeCodesignAssetUrl(url);
          const filename = `${slice.object_id}-${e.scale ?? 1}x.${e.format ?? extFromMime(e.screenshot?.mime) ?? 'png'}`;
          const dl = await downloadToArtifact(
            downloadUrl,
            `${sharingId}/slices`,
            filename,
            'SLICE_FETCH_FAILED',
            {
              request: call.context.request,
              headers: SLICE_DOWNLOAD_HEADERS,
              expectedBytes: e.screenshot?.length ?? e.screenshot?.size ?? e.size,
            },
          );
          downloads.push({
            format: e.format,
            scale: e.scale,
            url,
            downloadUrl: downloadUrl === url ? undefined : downloadUrl,
            path: dl.path,
            bytes: dl.bytes,
            mime: dl.mime,
            reusedExisting: dl.reusedExisting,
          });
        }

        if (downloads.length === 0) {
          return errorResult(
            new CodesignError('SLICE_FETCH_FAILED', 'matched exportables did not contain downloadable screenshot URLs', {
              layerObjectId,
              filters: { format, scales },
            }),
          );
        }

        return ok({
          sharingId,
          screen: { id: picked.id, objectId: picked.object_id, name: picked.name },
          slice: {
            name: slice.name,
            objectId: slice.object_id,
            rect: slice.rect,
          },
          downloads,
        });
      } catch (err) {
        log.warn({ err: errMsg(err), sharingId }, 'download_slice failed');
        return errorResult(err);
      } finally {
        await call.done();
      }
    },
  );
}

function acceptExportable(
  e: SliceExportable,
  filters: { format?: string; scales?: number[] },
): boolean {
  if (filters.format) {
    if (!e.format) return false;
    if (e.format.toLowerCase() !== filters.format.toLowerCase()) return false;
  }
  if (filters.scales && filters.scales.length > 0) {
    if (e.scale == null) return false;
    if (!filters.scales.includes(e.scale)) return false;
  }
  return true;
}

function extFromMime(mime?: string): string | undefined {
  if (!mime) return undefined;
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  return undefined;
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
