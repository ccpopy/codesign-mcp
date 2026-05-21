# Changelog

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
