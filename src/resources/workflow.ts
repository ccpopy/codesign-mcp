import type { McpServer } from '../mcp/server.js';

export const DESIGN_TO_CODE_WORKFLOW_URI = 'codesign://workflow/design-to-code';

const workflowMarkdown = `# CoDesign Design-to-Code Workflow

Use this workflow when a user asks an agent to implement, recreate, or inspect a Tencent CoDesign sharing link.

1. Call \`list_artboards\` with the CoDesign sharing URL and optional password. Use the returned design and artboard metadata to select the target screen.
2. Call \`get_artboard_spec\` for the selected artboard. Treat the official spec data as the source of truth for layout, text, color, CSS, coordinates, grouping, and slice metadata.
3. When the user supplies a copied CoDesign selection reference, pass its \`screenId\`, \`layerObjectId\`, and \`selectionScope\` to \`get_artboard_spec\`. Use \`selectionScope=region\` for a visual area or \`selectionScope=subtree\` for the selected node's strict descendants.
4. Reconstruct a selected area from \`selection.layers\`, \`selection.groups\`, \`selection.hierarchy\`, \`selection.bounds\`, and each node's \`relativeRect\`. Implement only that selection unless the user asks for the full page.
5. If the user specifies a development platform in natural language, such as Web, Android, 安卓, iOS, 微信小程序, or mini program, pass that wording as \`get_artboard_spec.targetPlatform\`.
6. If the user specifies a unit, custom scale, target design width, or rem base, pass those as \`targetUnit\`, \`customScale\`, \`customWidth\`, and \`remBasePx\`. For example, "1440px design width, rem, 1rem=100px" maps to \`targetUnit=rem\`, \`customWidth=1440\`, and \`remBasePx=100\`.
7. Use the returned \`spec.platformSpec\` or \`platformSelection\` for normalized platform id, units, converted rects, unit-adjusted CSS, and conversion metadata while keeping the raw spec as the original CoDesign data.
8. Unless the user's current request explicitly requires an absolute-positioned or canvas-style implementation, translate the CoDesign coordinates into semantic page structure and normal document flow before implementation. Prefer Flexbox/Grid and existing layout primitives for page layout; do not recreate the whole page as a flat canvas of globally absolute-positioned layers. When the user explicitly requests absolute positioning, honor that instruction and scope positioning to the requested page or selection container where practical. Otherwise reserve absolute/fixed positioning for local overlays or intentionally overlapping elements required by the design.
9. If the selected artboard includes designer-exported slice assets, call \`download_slice\` for those assets. Do not crop production assets from a preview image.
10. Use \`get_artboard_image\` only for visual comparison, review, or debugging.
11. Use \`codesign_status\` before private designs when login state or runtime paths need to be checked. Use \`codesign_login\` only when the user needs to establish a CoDesign browser session.
12. Surface access, password, login, network, missing-artboard, and missing-spec failures clearly. Do not fabricate design data when the official CoDesign data is unavailable.
`;

export function registerWorkflowResource(server: McpServer): void {
  server.registerResource(
    'design-to-code-workflow',
    DESIGN_TO_CODE_WORKFLOW_URI,
    {
      title: 'CoDesign Design-to-Code Workflow',
      description:
        'Read-only workflow guidance for using codesign-mcp tools to implement pages from Tencent CoDesign sharing links.',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: DESIGN_TO_CODE_WORKFLOW_URI,
          mimeType: 'text/markdown',
          text: workflowMarkdown,
        },
      ],
    }),
  );
}
