# Changelog

## 0.3.1 - 2026-08-29

### Fixed

- Encoded slice `object_id` values as reversible, cross-platform filename components so Windows downloads no longer fail for Figma-style IDs containing reserved characters such as `:`. ([#3](https://github.com/ccpopy/codesign-mcp/issues/3))
- Preserved existing UUID-style slice filenames while avoiding collisions with identifiers that already contain percent-encoded text.

### Tests

- Added regression coverage for UUID-style IDs, Windows-incompatible Figma-style IDs, and filename-encoding collisions.
- Verified real PNG downloads for both a UUID-style slice and the Issue #3 Figma-style slice on Windows.

## 0.3.0 - 2026-07-29

### Added

- Added a repository-hosted Tampermonkey userscript that copies the active CoDesign screen and layer selection as a structured Agent prompt without including the sharing password.
- Added `selectionScope` support to `get_artboard_spec`: `layer` preserves the existing single-node response, `subtree` returns strict descendants, and `region` returns all non-ancestor nodes contained by the selected bounds.
- Added selected-region hierarchy, bounds, relative coordinates, and platform-filtered selection metadata.

### Changed

- Clarified that semantic document flow is the default design-to-code strategy while an explicit user request for absolute or canvas-style positioning takes precedence.
- Positioned the userscript action before CoDesign's native inspector action so the existing control keeps its expected placement.

### Tests

- Added coverage for single-layer, subtree, spatial region, relative coordinate, and missing-layer selection behavior.
- Added userscript syntax validation to the test command.
- Verified region selection against a real CoDesign sharing screen, including spatial sibling layers and relative coordinates.

## 0.2.0 - 2026-07-02

### Added

- Added `targetPlatform` support to `get_artboard_spec` for natural-language platform names such as `web`, `Android`, `安卓`, `iOS`, `微信小程序`, and `mini program`.
- Added platform presentation metadata under `spec.platformSpec`, including normalized platform id, units, converted rects, unit-adjusted CSS, and conversion details.
- Added CoDesign-style custom platform settings with `targetUnit`, `customScale`, `customWidth`, and `remBasePx`, including rem conversion for target-width workflows.
- Updated the design-to-code prompt and workflow resource so agents pass platform, unit, custom width, custom scale, and rem base settings when users provide them in natural language.

### Tests

- Added platform alias, unit conversion, custom width, rem base, and invalid platform coverage.
- Verified the real CoDesign sharing link flow with the fuzzy request "设计稿目标宽度 1440px，单位用 rem".

## 0.1.10 - 2026-06-09

### Fixed

- Updated the CoDesign design-to-code prompt and workflow guidance to require semantic page structure and normal document flow before coding.
- Clarified that Flexbox/Grid should be preferred for page layout, with absolute or fixed positioning reserved for local overlays or intentionally overlapping elements.

## 0.1.9 - 2026-05-26

### Fixed

- Delayed creation of the default `.codesign-mcp` runtime directory until a tool actually needs local state or artifacts.
- Kept default startup logging from creating the runtime directory while still honoring an explicit `CODESIGN_LOG_FILE`.

### Tests

- Added startup coverage to ensure server initialization does not create the default runtime directory.

## 0.1.8 - 2026-05-22

### Security

- Removed runtime dependencies on the MCP SDK, Pino, and Zod to reduce third-party supply-chain exposure.
- Replaced in-page dynamic fetch calls with Playwright API request calls guarded by CoDesign same-origin checks.
- Added remote asset allowlisting and CoDesign COS-to-CDN normalization for meta, screen, and slice downloads.
- Hardened `codesign_logout` so it only clears the configured profile directory, not arbitrary children of a broad data directory.
- Expanded `debug_collect_network` redaction for sharing IDs, account/team IDs, sensitive headers, query values, CDN path tokens, and response bodies.

### Changed

- Added a small local MCP stdio implementation and JSON schema validator for the server's current tool, prompt, and resource surface.
- Replaced Pino with a local JSON-lines file logger.
- Disabled source map output and excluded generated source maps from published package contents.

### Fixed

- `prompts/get` now reports invalid prompt arguments as JSON-RPC invalid params instead of internal server errors.
- Diagnostic response summaries now preserve useful request shape while hiding sensitive values.

### Tests

- Added coverage for profile deletion safety, diagnostic redaction, same-origin request blocking, and MCP prompt argument validation.

## 0.1.7 - 2026-05-21

### Added

- Added the `implement_codesign_page` MCP prompt for the documented CoDesign design-to-code workflow.
- Added the `codesign://workflow/design-to-code` read-only MCP resource for workflow guidance.
- Extended the stdio smoke test to verify tools, prompts, and resources.
- Added README badges for LobeHub, npm, Node.js, TypeScript, MCP SDK, and license metadata.

## 0.1.6 - 2026-05-19

### Changed

- Invalid scalar environment variables now fail at startup instead of silently using defaults. For example, `CODESIGN_KEEP_BROWSER=maybe` and `CODESIGN_LOG_LEVEL=verbose` will stop the server with a clear configuration error. This is intentional so configuration mistakes are exposed before runtime.
- Same-origin CoDesign API fetch failures now surface as `SHARING_FETCH_FAILED` instead of being misreported as missing shares.
- Artifact downloads now reject paths that escape the configured artifacts directory.

### Tests

- Added coverage for strict environment parsing, same-origin request failures, and artifact path validation.
