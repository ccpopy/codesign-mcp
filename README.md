# codesign-mcp

Local MCP server for Tencent CoDesign sharing links. It reads CoDesign sharing data, artboard specs, preview images, and designer-exported slices.

## Usage

Install and run directly with npm:

```powershell
npx -y codesign-mcp
```

For Claude/Codex-style MCP configuration, set the command to `npx` and pass the package name as args:

```json
{
  "mcpServers": {
    "codesign-mcp": {
      "command": "npx",
      "args": ["-y", "codesign-mcp"],
      "cwd": "F:/your-project"
    }
  }
}
```

Runtime files are written to the caller workspace by default:

```text
<cwd>/.codesign-mcp/profile
<cwd>/.codesign-mcp/artifacts
<cwd>/.codesign-mcp/codesign-mcp.log
```

Override the workspace when the MCP client cannot set `cwd`:

```text
CODESIGN_WORKSPACE_DIR=F:/your-project
```

## Tools

- `codesign_status`: Show runtime paths, browser state, and profile state.
- `codesign_login`: Open a visible Chromium window for CoDesign QR-code login.
- `codesign_logout`: Clear the persisted profile.
- `list_artboards`: Resolve a CoDesign sharing URL into designs and artboards.
- `get_artboard_spec`: Fetch official CoDesign `meta_url` specs with layers, text, colors, CSS, groups, and slice metadata.
- `get_artboard_image`: Fetch preview or cover images for visual comparison.
- `download_slice`: Download designer-exported slice assets from the official slice manifest.
- `debug_collect_network`: Collect a redacted network summary for diagnosis.

For design-to-code work, use `list_artboards`, then `get_artboard_spec`, then `download_slice` for assets. Preview screenshots are for comparison, not for production slicing.

## Development

```powershell
npm install
npm test
node scripts/stdio-smoke.mjs
```

## Publishing

This package is intended to be published from GitHub Actions using npm Trusted Publishing. Do not store long-lived npm tokens in the repository.

Before first publish:

1. Create or choose an npm package name or scope.
2. Configure npm Trusted Publishing for the GitHub repository and `.github/workflows/publish.yml`.
3. Enable 2FA on npm for account and publishing protection.
4. Create a GitHub release to trigger publication.
