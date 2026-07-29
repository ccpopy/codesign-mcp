import type { McpServer } from '../mcp/server.js';
import { objectSchema } from '../mcp/schema.js';
import {
  LAYER_SELECTION_SCOPES,
  type LayerSelectionScope,
} from '../codesign/selection.js';

interface DesignToCodePromptInput {
  sharingUrl: string;
  password?: string;
  artboardName?: string;
  screenId?: number | string;
  layerObjectId?: string;
  layerName?: string;
  selectionScope?: LayerSelectionScope;
  targetPlatform?: string;
  targetUnit?: string;
  customScale?: number;
  customWidth?: number;
  remBasePx?: number;
  outputDir?: string;
}

const argsSchema = objectSchema(
  {
    sharingUrl: {
      type: 'string',
      minLength: 1,
      description: 'CoDesign sharing URL or bare sharing id.',
    },
    password: {
      type: 'string',
      description: 'Sharing password, if the CoDesign link requires one.',
    },
    artboardName: {
      type: 'string',
      description: 'Preferred artboard or screen name, if the user already knows it.',
    },
    screenId: {
      anyOf: [{ type: 'integer' }, { type: 'string' }],
      description: 'Exact CoDesign screen id copied from a selected-region reference.',
    },
    layerObjectId: {
      type: 'string',
      description: 'Exact CoDesign layer object_id copied from a selected-region reference.',
    },
    layerName: {
      type: 'string',
      description: 'Human-readable selected layer name for prompt context.',
    },
    selectionScope: {
      type: 'string',
      enum: [...LAYER_SELECTION_SCOPES],
      description:
        'Selected layer scope: layer, strict subtree, or the complete visual region inside its bounds.',
    },
    targetPlatform: {
      type: 'string',
      description:
        'Target development platform in the user\'s natural language, e.g. web, Android, 安卓, iOS, 微信小程序, or mini program.',
    },
    targetUnit: {
      type: 'string',
      description: 'Target unit when the user specifies one, e.g. px, rem, dp, pt, or rpx.',
    },
    customScale: {
      type: 'number',
      minimum: 0,
      description: 'Custom platform scale when the user specifies a multiplier such as 0.75x or 2x.',
    },
    customWidth: {
      type: 'number',
      minimum: 0,
      description:
        'Custom platform width when the user specifies a target design width such as 1440px. The tool computes customWidth / source artboard width.',
    },
    remBasePx: {
      type: 'number',
      minimum: 0,
      description: 'Pixels per rem when targetUnit is rem, e.g. 16 or 100.',
    },
    outputDir: {
      type: 'string',
      description: 'Target implementation directory, if the user provided one.',
    },
  },
  ['sharingUrl'],
);

export function registerDesignToCodePrompt(server: McpServer): void {
  server.registerPrompt(
    'implement_codesign_page',
    {
      title: 'Implement CoDesign Page',
      description:
        'Generate a design-to-code workflow prompt that uses list_artboards, get_artboard_spec, and download_slice in order.',
      argsSchema,
    },
    async ({
      sharingUrl,
      password,
      artboardName,
      screenId,
      layerObjectId,
      layerName,
      selectionScope,
      targetPlatform,
      targetUnit,
      customScale,
      customWidth,
      remBasePx,
      outputDir,
    }: DesignToCodePromptInput) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildPrompt({
              sharingUrl,
              password,
              artboardName,
              screenId,
              layerObjectId,
              layerName,
              selectionScope,
              targetPlatform,
              targetUnit,
              customScale,
              customWidth,
              remBasePx,
              outputDir,
            }),
          },
        },
      ],
    }),
  );
}

function buildPrompt(args: {
  sharingUrl: string;
  password?: string;
  artboardName?: string;
  screenId?: number | string;
  layerObjectId?: string;
  layerName?: string;
  selectionScope?: LayerSelectionScope;
  targetPlatform?: string;
  targetUnit?: string;
  customScale?: number;
  customWidth?: number;
  remBasePx?: number;
  outputDir?: string;
}): string {
  const passwordLine = args.password ? `Password: ${args.password}\n` : '';
  const artboardLine = args.artboardName ? `Preferred artboard: ${args.artboardName}\n` : '';
  const screenIdLine = args.screenId != null ? `Screen ID: ${args.screenId}\n` : '';
  const layerIdLine = args.layerObjectId ? `Layer object ID: ${args.layerObjectId}\n` : '';
  const layerNameLine = args.layerName ? `Selected layer: ${args.layerName}\n` : '';
  const effectiveSelectionScope = args.layerObjectId
    ? (args.selectionScope ?? 'region')
    : args.selectionScope;
  const selectionScopeLine = effectiveSelectionScope
    ? `Selection scope: ${effectiveSelectionScope}\n`
    : '';
  const platformLine = args.targetPlatform ? `Target platform: ${args.targetPlatform}\n` : '';
  const unitLine = args.targetUnit ? `Target unit: ${args.targetUnit}\n` : '';
  const customScaleLine = args.customScale != null ? `Custom scale: ${args.customScale}\n` : '';
  const customWidthLine = args.customWidth != null ? `Custom width: ${args.customWidth}\n` : '';
  const remBaseLine = args.remBasePx != null ? `Rem base px: ${args.remBasePx}\n` : '';
  const outputDirLine = args.outputDir ? `Target directory: ${args.outputDir}\n` : '';

  return `Implement the page from this Tencent CoDesign design.

CoDesign link: ${args.sharingUrl}
${passwordLine}${artboardLine}${screenIdLine}${layerNameLine}${layerIdLine}${selectionScopeLine}${platformLine}${unitLine}${customScaleLine}${customWidthLine}${remBaseLine}${outputDirLine}
Requirements:
1. Call the codesign-mcp list_artboards tool first to resolve the sharing link and inspect the available designs and artboards.
2. Select the requested artboard when a preferred artboard or screen ID is provided. Otherwise, choose the artboard that best matches the user's page request and state the selected artboard name.
3. Call get_artboard_spec for the selected artboard and use the official layer, text, color, CSS, coordinate, group, and slice metadata as the source of truth. When a layer object ID is provided, pass it as layerObjectId together with the requested selectionScope and implement only the returned selection.
4. For a selected region, use selection.layers, selection.groups, selection.hierarchy, selection.bounds, and each node's relativeRect to reconstruct its structure. selectionScope=region includes non-ancestor nodes fully contained by the selected bounds; selectionScope=subtree includes only strict descendants.
5. If a target platform is provided or implied by the user's request, pass it as get_artboard_spec.targetPlatform using the user's natural-language wording.
6. If the user specifies a unit, custom scale, target design width, or rem base, pass those as get_artboard_spec.targetUnit, customScale, customWidth, and remBasePx. For example, "1440px design width, rem, 1rem=100px" maps to targetUnit=rem, customWidth=1440, remBasePx=100.
7. Use spec.platformSpec or platformSelection when returned for platform id, units, converted rects, unit-adjusted CSS, and conversion metadata. Keep the raw CoDesign data available as the source of truth.
8. Unless the user's current request explicitly requires an absolute-positioned or canvas-style implementation, translate the CoDesign coordinates into semantic page structure and normal document flow before coding. Prefer Flexbox/Grid and existing layout primitives for page layout; do not recreate the whole page as a flat canvas of globally absolute-positioned layers. When the user explicitly requests absolute positioning, honor that instruction and scope positioning to the requested page or selection container where practical. Otherwise reserve absolute/fixed positioning for local overlays or intentionally overlapping elements required by the design.
9. When the design includes designer-exported slice assets, call download_slice for those assets. Do not crop production assets from the full preview image.
10. Use get_artboard_image only for visual comparison and final review.
11. Implement the page in the target directory when one is provided, following the existing project structure and styles.
12. Surface any CoDesign access, password, login, or missing-spec failure clearly instead of fabricating design data.`;
}
