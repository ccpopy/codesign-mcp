import type { McpServer } from '../mcp/server.js';

export const DESIGN_TO_CODE_WORKFLOW_URI = 'codesign://workflow/design-to-code';

const workflowMarkdown = `# CoDesign Design-to-Code Workflow

Use this workflow when a user asks an agent to implement, recreate, or inspect a Tencent CoDesign sharing link.

1. Call \`list_artboards\` with the CoDesign sharing URL and optional password. Use the returned design and artboard metadata to select the target screen.
2. Call \`get_artboard_spec\` for the selected artboard. Treat the official spec data as the source of truth for layout, text, color, CSS, coordinates, grouping, and slice metadata.
3. Translate the CoDesign coordinates into semantic page structure and normal document flow before implementation. Use Flexbox/Grid and existing layout primitives for page layout; do not recreate the whole page as a flat canvas of globally absolute-positioned layers. Reserve absolute/fixed positioning for local overlays or intentionally overlapping elements required by the design.
4. If the selected artboard includes designer-exported slice assets, call \`download_slice\` for those assets. Do not crop production assets from a preview image.
5. Use \`get_artboard_image\` only for visual comparison, review, or debugging.
6. Use \`codesign_status\` before private designs when login state or runtime paths need to be checked. Use \`codesign_login\` only when the user needs to establish a CoDesign browser session.
7. Surface access, password, login, network, missing-artboard, and missing-spec failures clearly. Do not fabricate design data when the official CoDesign data is unavailable.
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
