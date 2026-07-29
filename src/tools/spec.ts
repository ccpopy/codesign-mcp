import type { McpServer } from '../mcp/server.js';
import { objectSchema } from '../mcp/schema.js';
import { browserManager } from '../browser/manager.js';
import { getSharingDetail } from '../codesign/sharing.js';
import { fetchMetaJson } from '../codesign/meta.js';
import { fetchSliceManifest } from '../codesign/slices.js';
import { assertSpecObject, normalizeSpec, findLayerByObjectId } from '../codesign/parser.js';
import { buildPlatformSpec, supportedTargetPlatforms } from '../codesign/platform.js';
import {
  buildLayerSelection,
  LAYER_SELECTION_SCOPES,
  type LayerSelection,
  type LayerSelectionScope,
} from '../codesign/selection.js';
import { CodesignError } from '../codesign/errors.js';
import { parseSharingId } from '../utils/url.js';
import { errorResult } from './artboards.js';
import { getLogger } from '../logger.js';
import type { PlatformSpec, SharingScreen, SpecObject } from '../codesign/types.js';

const log = getLogger();

interface SpecInput {
  sharingUrl: string;
  password?: string;
  screenId?: number | string;
  objectId?: string;
  screenName?: string;
  layerObjectId?: string;
  selectionScope: LayerSelectionScope;
  targetPlatform?: string;
  targetUnit?: string;
  customScale?: number;
  customWidth?: number;
  remBasePx?: number;
  includeSlices: boolean;
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
      description: 'Optional object_id of the selected CoDesign layer or group.',
    },
    selectionScope: {
      type: 'string',
      enum: [...LAYER_SELECTION_SCOPES],
      default: 'layer',
      description:
        'Selection scope used with layerObjectId: layer returns the matching node, subtree adds strict descendants, and region returns all non-ancestor nodes fully contained by the selected bounds.',
    },
    targetPlatform: {
      type: 'string',
      description:
        'Optional natural-language target platform for presentation metadata, e.g. web, Android, 安卓, iOS, 微信小程序, mini program, or raw. The raw CoDesign spec is still returned unchanged.',
    },
    targetUnit: {
      type: 'string',
      description:
        'Optional target unit for platformSpec, e.g. px, rem, dp, pt, or rpx. Must be supported by targetPlatform.',
    },
    customScale: {
      type: 'number',
      minimum: 0,
      description:
        'Optional explicit conversion multiplier, equivalent to CoDesign custom scale such as 0.75 or 2. Cannot be combined with customWidth.',
    },
    customWidth: {
      type: 'number',
      minimum: 0,
      description:
        'Optional target artboard width for conversion, equivalent to CoDesign custom width. Scale is customWidth divided by the source artboard width. Cannot be combined with customScale.',
    },
    remBasePx: {
      type: 'number',
      minimum: 0,
      description:
        'Optional px-per-rem divisor used only when targetUnit is rem. Defaults to 16 and is returned in platformSpec.conversion.',
    },
    includeSlices: { type: 'boolean', default: true },
  },
  ['sharingUrl'],
);

export function registerSpecTool(server: McpServer): void {
  server.registerTool(
    'get_artboard_spec',
    {
      title: 'Get CoDesign Artboard Spec',
      description:
        'Canonical CoDesign source for design-to-code: fetches the official meta_url JSON with layer positions, text, fills, colors, CSS, groups, and slice manifest. ' +
        'Returns raw CoDesign fields; when css and fills disagree, inspect both fields and the screenshot instead of assuming one is always authoritative. ' +
        'If targetPlatform is provided in natural language, also returns platformSpec with normalized platform id, unit, converted rects, and unit-adjusted CSS. targetUnit, customScale, customWidth, and remBasePx mirror CoDesign platform settings. ' +
        'Use this before writing HTML/CSS from a CoDesign URL. Do not crop or OCR preview screenshots when this tool can return the spec. ' +
        'Selector precedence: screenId > objectId > screenName. Multiple screens without a selector return SCREEN_SELECTOR_REQUIRED with options. ' +
        'When layerObjectId is provided, selectionScope=layer preserves the single-node response, subtree returns the strict child hierarchy, and region returns the complete visual area inside the selected bounds with relative coordinates. ' +
        'includeSlices defaults to true so available designer-exported slice metadata is returned with the spec.',
      inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args: SpecInput) => {
      const {
        sharingUrl,
        password,
        screenId,
        objectId,
        screenName,
        layerObjectId,
        selectionScope,
        targetPlatform,
        targetUnit,
        customScale,
        customWidth,
        remBasePx,
        includeSlices,
      } = args;
      let sharingId: string;
      try {
        sharingId = parseSharingId(sharingUrl);
      } catch (err) {
        return errorResult(err);
      }

      if (!layerObjectId && selectionScope !== 'layer') {
        return errorResult(
          new CodesignError(
            'INVALID_SELECTION',
            'layerObjectId is required when selectionScope is subtree or region',
            { selectionScope },
          ),
        );
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

        const hasPlatformOptions =
          targetUnit != null || customScale != null || customWidth != null || remBasePx != null;
        if (!targetPlatform && hasPlatformOptions) {
          return errorResult(
            new CodesignError(
              'INVALID_PLATFORM',
              'targetPlatform is required when targetUnit, customScale, customWidth, or remBasePx is set',
              { targetUnit, customScale, customWidth, remBasePx },
            ),
          );
        }

        const platformSpec = targetPlatform
          ? buildPlatformSpec(spec, targetPlatform, {
              targetUnit,
              customScale,
              customWidth,
              remBasePx,
            })
          : undefined;
        const normalized = normalizeSpec(spec, slices, platformSpec);

        if (layerObjectId) {
          const layer = findLayerByObjectId(normalized, layerObjectId);
          const selection = buildLayerSelection(normalized, layerObjectId, selectionScope);
          if (!layer || !selection) {
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
            selection,
            platformLayer: platformSpec
              ? [...platformSpec.layers, ...platformSpec.groups].find((l) => l.objectId === layerObjectId)
              : undefined,
            platformSelection: platformSpec
              ? buildPlatformSelection(platformSpec, selection)
              : undefined,
            platform: platformSpec
              ? {
                  requested: platformSpec.requested,
                  id: platformSpec.id,
                  label: platformSpec.label,
                  unit: platformSpec.unit,
                  scale: platformSpec.scale,
                  conversion: platformSpec.conversion,
                }
              : undefined,
          });
        }

        return ok({
          sharingId,
          screen: { id: picked.id, objectId: picked.object_id, name: picked.name },
          supportedTargetPlatforms: supportedTargetPlatforms(),
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

function buildPlatformSelection(platformSpec: PlatformSpec, selection: LayerSelection) {
  const selectedIds = new Set(
    [...selection.layers, ...selection.groups].map((layer) => layer.object_id),
  );
  const root = [...platformSpec.layers, ...platformSpec.groups].find(
    (layer) => layer.objectId === selection.rootObjectId,
  );
  if (!root) {
    throw new CodesignError('META_SCHEMA_MISMATCH', 'platform selection root is missing', {
      rootObjectId: selection.rootObjectId,
      platform: platformSpec.id,
    });
  }
  return {
    scope: selection.scope,
    root,
    layers: platformSpec.layers.filter((layer) => selectedIds.has(layer.objectId)),
    groups: platformSpec.groups.filter((layer) => selectedIds.has(layer.objectId)),
  };
}
