import type { McpServer } from '../mcp/server.js';
import { objectSchema } from '../mcp/schema.js';

interface DesignToCodePromptInput {
  sharingUrl: string;
  password?: string;
  artboardName?: string;
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
    async ({ sharingUrl, password, artboardName, outputDir }: DesignToCodePromptInput) => ({
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
4. Translate the CoDesign coordinates into semantic page structure and normal document flow before coding. Use Flexbox/Grid and existing layout primitives for page layout; do not recreate the whole page as a flat canvas of globally absolute-positioned layers. Reserve absolute/fixed positioning for local overlays or intentionally overlapping elements required by the design.
5. When the design includes designer-exported slice assets, call download_slice for those assets. Do not crop production assets from the full preview image.
6. Use get_artboard_image only for visual comparison and final review.
7. Implement the page in the target directory when one is provided, following the existing project structure and styles.
8. Surface any CoDesign access, password, login, or missing-spec failure clearly instead of fabricating design data.`;
}
