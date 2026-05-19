# tests/fixtures

Synthetic fixture set for parser and tool contract tests.

These files intentionally do not contain real HAR response bodies, real CoDesign URLs, user identifiers, design copy, cookies, authorization headers, passwords, or state keys. Real HAR files should stay under `har/` and are ignored by Git.

The fixture shape mirrors the confirmed CoDesign response structure:

- `sharing-detail.json`: `designs[].screens[]` with `meta_url`, `slices_url`, dimensions, and image URLs.
- `meta-spec-object.json`: artboard spec object with `layers`, `groups`, `css`, text styling, and color fields.
- `meta-slice-manifest.json`: slice manifest array with `exportables[].screenshot.url`.
- `sharing-state-keys.json`: success and invalid password response shapes with credential values redacted.
- `user.json`: authorized and unauthorized login probe shapes.
