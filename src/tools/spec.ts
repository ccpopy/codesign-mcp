import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { browserManager } from '../browser/manager.js';
import { getSharingDetail } from '../codesign/sharing.js';
import { fetchMetaJson } from '../codesign/meta.js';
import { fetchSliceManifest } from '../codesign/slices.js';
import { assertSpecObject, normalizeSpec, findLayerByObjectId } from '../codesign/parser.js';
import { CodesignError } from '../codesign/errors.js';
import { parseSharingId } from '../utils/url.js';
import { errorResult } from './artboards.js';
import { getLogger } from '../logger.js';
import type { SharingScreen, SpecObject } from '../codesign/types.js';

const log = getLogger();

const inputSchema = {
  sharingUrl: z.string().min(1),
  password: z.string().optional(),
  screenId: z.union([z.number().int(), z.string()]).optional(),
  objectId: z.string().optional(),
  screenName: z.string().optional(),
  layerObjectId: z.string().optional().describe('Optional: return only the matching layer'),
  includeSlices: z.boolean().optional().default(true),
} as const;

export function registerSpecTool(server: McpServer): void {
  server.registerTool(
    'get_artboard_spec',
    {
      title: 'Get CoDesign Artboard Spec',
      description:
        'Canonical CoDesign source for design-to-code: fetches the official meta_url JSON with layer positions, text, fills, colors, CSS, groups, and slice manifest. ' +
        'Returns raw CoDesign fields; when css and fills disagree, inspect both fields and the screenshot instead of assuming one is always authoritative. ' +
        'Use this before writing HTML/CSS from a CoDesign URL. Do not crop or OCR preview screenshots when this tool can return the spec. ' +
        'Selector precedence: screenId > objectId > screenName. Multiple screens without a selector return SCREEN_SELECTOR_REQUIRED with options. ' +
        'includeSlices defaults to true so available designer-exported slice metadata is returned with the spec.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const { sharingUrl, password, screenId, objectId, screenName, layerObjectId, includeSlices } = args;
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
          if (anyProvided(selector)) {
            return errorResult(
              new CodesignError('SCREEN_NOT_FOUND', 'no screen matches the given selector', {
                selector,
                available: summarizeScreens(allScreens),
              }),
            );
          }
          // 多画板未指定
          if (allScreens.length === 1) {
            // 单画板默认 picked，逻辑不到这里。但保险起见。
            return errorResult(
              new CodesignError('SCREEN_NOT_FOUND', 'no screen matched (unexpected)', {}),
            );
          }
          return errorResult(
            new CodesignError(
              'SCREEN_SELECTOR_REQUIRED',
              'multiple screens present; specify screenId / objectId / screenName',
              { available: summarizeScreens(allScreens) },
            ),
          );
        }

        // 拉 meta JSON
        const specRaw = await fetchMetaJson<unknown>(picked.meta_url);
        try {
          assertSpecObject(specRaw);
        } catch (err) {
          log.warn({ err: (err as Error).message }, 'spec schema mismatch');
          return errorResult(err);
        }
        const spec = specRaw as SpecObject;

        let slices = undefined;
        if (includeSlices && picked.slices_url) {
          slices = await fetchSliceManifest(picked.slices_url);
        }

        const normalized = normalizeSpec(spec, slices);

        if (layerObjectId) {
          const layer = findLayerByObjectId(normalized, layerObjectId);
          if (!layer) {
            return errorResult(
              new CodesignError('SCREEN_NOT_FOUND', 'layer not found by objectId', {
                layerObjectId,
                screen: { id: picked.id, objectId: picked.object_id, name: picked.name },
              }),
            );
          }
          return ok({
            sharingId,
            screen: { id: picked.id, objectId: picked.object_id, name: picked.name },
            layer,
          });
        }

        return ok({
          sharingId,
          screen: { id: picked.id, objectId: picked.object_id, name: picked.name },
          spec: normalized,
        });
      } catch (err) {
        log.warn({ err: errMsg(err), sharingId }, 'get_artboard_spec failed');
        return errorResult(err);
      } finally {
        await call.done();
      }
    },
  );
}

function anyProvided(sel: {
  screenId?: number | string;
  objectId?: string;
  screenName?: string;
}): boolean {
  return sel.screenId != null || sel.objectId != null || sel.screenName != null;
}

export function pickScreen(
  screens: SharingScreen[],
  sel: { screenId?: number | string; objectId?: string; screenName?: string },
): SharingScreen | undefined {
  if (sel.screenId != null) {
    const idStr = String(sel.screenId);
    return screens.find((s) => String(s.id) === idStr);
  }
  if (sel.objectId) {
    return screens.find((s) => s.object_id === sel.objectId);
  }
  if (sel.screenName) {
    return screens.find((s) => s.name === sel.screenName);
  }
  // 单画板时默认选第一个
  if (screens.length === 1) return screens[0];
  return undefined;
}

export function summarizeScreens(
  screens: SharingScreen[],
): Array<{ id: number; objectId: string; name: string; width: number; height: number }> {
  return screens.map((s) => ({
    id: s.id,
    objectId: s.object_id,
    name: s.name,
    width: s.width,
    height: s.height,
  }));
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
