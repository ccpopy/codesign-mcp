import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const argsSchema = {
  sharingUrl: z.string().min(1).describe('CoDesign sharing URL or bare sharing id.'),
  password: z.string().optional().describe('Sharing password, if the CoDesign link requires one.'),
  artboardName: z.string().optional().describe('Preferred artboard or screen name, if the user already knows it.'),
  outputDir: z.string().optional().describe('Target implementation directory, if the user provided one.'),
} as const;

export function registerDesignToCodePrompt(server: McpServer): void {
  server.registerPrompt(
    'implement_codesign_page',
    {
      title: 'Implement CoDesign Page',
      description:
        'Generate a design-to-code workflow prompt that uses list_artboards, get_artboard_spec, and download_slice in order.',
      argsSchema,
    },
    async ({ sharingUrl, password, artboardName, outputDir }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildPrompt({ sharingUrl, password, artboardName, outputDir }),
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
  outputDir?: string;
}): string {
  const passwordLine = args.password ? `Password: ${args.password}\n` : '';
  const artboardLine = args.artboardName ? `Preferred artboard: ${args.artboardName}\n` : '';
  const outputDirLine = args.outputDir ? `Target directory: ${args.outputDir}\n` : '';

  return `Implement the page from this Tencent CoDesign design.

CoDesign link: ${args.sharingUrl}
${passwordLine}${artboardLine}${outputDirLine}
Requirements:
1. Call the codesign-mcp list_artboards tool first to resolve the sharing link and inspect the available designs and artboards.
2. Select the requested artboard when a preferred artboard is provided. Otherwise, choose the artboard that best matches the user's page request and state the selected artboard name.
3. Call get_artboard_spec for the selected artboard and use the official layer, text, color, CSS, coordinate, group, and slice metadata as the source of truth.
4. When the design includes designer-exported slice assets, call download_slice for those assets. Do not crop production assets from the full preview image.
5. Use get_artboard_image only for visual comparison and final review.
6. Implement the page in the target directory when one is provided, following the existing project structure and styles.
7. Surface any CoDesign access, password, login, or missing-spec failure clearly instead of fabricating design data.`;
}
