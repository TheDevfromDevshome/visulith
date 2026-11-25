# Capability status

Capabilities are declared per plugin and per backend. A true flag never means "complete support for the language"; it means the listed behavior is implemented for the supported subset.

| Area | Implemented | Status |
|---|---|---|
| Graph documents | Parse, validate, persist (schema 0.1) | Available for MVP subset |
| Graph kinds | `structured-flow`, linear chains and non-reconverging `if`/`else` branches | Partial |
| Graph variables | String variables via `visulith.core.set-variable`, equality/inequality conditions | Experimental |
| Graph editing | Add/connect/delete/move nodes in UI | Available (MVP subset) |
| IR | Version 0.1, literals, variables, binary equality, calls, conditionals, unit return, provenance | Partial |
| TypeScript backend | Deterministic generation, source maps | Available for supported IR |
| Build/run | tsc API + Node runtime, structured diagnostics | Available for TypeScript |
| JavaScript/Python/C/C++/Rust/Java/C#/Assembly | Declarative plugin metadata only, no graph lowering | Not claimed |
| HTML/CSS | Templates only | Partial |
| Plugins | Declarative manifests, capability declarations | Available (no executable plugin code) |
| WASM/worker plugins | Not implemented | Unavailable |
| npm libraries | Metadata inspection + best-effort nodes + manual adapters | Experimental |
| AI | Provider interface, local deterministic proposal provider | Experimental, approval-gated |
| Registry | Local metadata, checksum verification, HTTP publish/search | Experimental |
| Debugging | No DAP adapter yet | Unavailable |
| Collaboration/cloud | Not implemented | Out of scope |

Unsupported constructs produce structured diagnostics; they are never silently omitted.
