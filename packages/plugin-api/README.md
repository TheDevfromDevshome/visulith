# @visulith/plugin-api

Versioned declarative plugin manifest types and validation.

- Manifest schema `1` with required `id`, `name`, `version`, `hostApi`,
  `categories`, `capabilities`, and `license`.
- Stable capability constants and a strict `hostApi` range checker for
  `^0.1` / `0.x`-style ranges.
- Structured diagnostics for invalid manifests; unknown capabilities and
  versions are never silently reinterpreted.
- Interfaces for contribution providers describe a **future** extension
  point only. The MVP host reads JSON manifests and never calls providers.

```ts
import { validatePluginManifest } from "@visulith/plugin-api";

const result = validatePluginManifest(JSON.parse(text));
```
