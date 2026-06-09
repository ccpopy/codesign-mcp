# Changelog

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
