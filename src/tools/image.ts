import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { browserManager } from '../browser/manager.js';
import { getSharingDetail } from '../codesign/sharing.js';
import { CodesignError } from '../codesign/errors.js';
import { parseSharingId } from '../utils/url.js';
import { downloadToArtifact } from '../utils/download.js';
import { errorResult } from './artboards.js';
import { pickScreen, summarizeScreens } from './spec.js';
import { getLogger } from '../logger.js';
import type { SharingScreen } from '../codesign/types.js';

const log = getLogger();

const inputSchema = {
  sharingUrl: z.string().min(1),
  password: z.string().optional(),
  screenId: z.union([z.number().int(), z.string()]).optional(),
  objectId: z.string().optional(),
  screenName: z.string().optional(),
  variant: z.enum(['full', 'cover']).optional().default('full'),
  download: z.boolean().optional().default(false),
} as const;

export function registerImageTool(server: McpServer): void {
  server.registerTool(
    'get_artboard_image',
    {
      title: 'Get CoDesign Artboard Image',
      description:
        'Returns the CoDesign preview or cover image for visual comparison only. ' +
        'For implementation, prefer get_artboard_spec for layout/text/CSS and download_slice for designer-exported assets; do not crop this preview image to create production slices. ' +
        'When download=true, stores the image under <workspaceRoot>/.codesign-mcp/artifacts/<sharingId>/screens/. Selector precedence: screenId > objectId > screenName.',
      inputSchema,
    },
    async (args) => {
      const { sharingUrl, password, screenId, objectId, screenName, variant, download } = args;
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

        const url = variant === 'cover' ? picked.image?.cover_url : picked.image?.url;
        if (!url) {
          return errorResult(
            new CodesignError('SCREEN_NOT_FOUND', `screen has no ${variant} image url`, {
              screen: { id: picked.id, objectId: picked.object_id, name: picked.name },
            }),
          );
        }

        const result: Record<string, unknown> = {
          sharingId,
          variant,
          screen: { id: picked.id, objectId: picked.object_id, name: picked.name },
          image: {
            url,
            width: picked.image?.width,
            height: picked.image?.height,
            mime: picked.image?.mime,
            size: picked.image?.size,
          },
        };

        if (download) {
          try {
            const dl = await downloadToArtifact(
              url,
              `${sharingId}/screens`,
              `${picked.id}-${variant}${guessExt(url, picked.image?.mime)}`,
              'META_FETCH_FAILED',
            );
            result.download = { path: dl.path, bytes: dl.bytes, mime: dl.mime };
          } catch (err) {
            log.warn({ err: (err as Error).message }, 'image download failed');
            return errorResult(err);
          }
        }

        return ok(result);
      } catch (err) {
        log.warn({ err: errMsg(err), sharingId }, 'get_artboard_image failed');
        return errorResult(err);
      } finally {
        await call.done();
      }
    },
  );
}

function guessExt(url: string, mime?: string): string {
  if (mime) {
    if (mime.includes('png')) return '.png';
    if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
    if (mime.includes('webp')) return '.webp';
  }
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-z0-9]+)$/i);
    if (m) return `.${m[1]!.toLowerCase()}`;
  } catch {
    /* ignore */
  }
  return '.png';
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
