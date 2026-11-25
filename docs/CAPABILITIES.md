# Capability status

Capabilities are declared per plugin and per backend. A true flag never means "complete support for the language"; it means the listed behavior is implemented for the supported subset.

| Area | Implemented | Status |
|---|---|---|
| Graph documents | Parse, validate, persist (schema 0.1) | Available for MVP subset |
| Graph kinds | `structured-flow` (chains, joins, repeat loops) and `dataflow` (integer literals, addition, sinks) | Partial |
| Graph variables | String variables via `visulith.core.set-variable`, equality/inequality conditions | Experimental |
| Graph loops | `visulith.core.repeat` with a positive integer literal, body, back edge and continuation; other loop forms rejected | Experimental |
| Graph editing | Add/connect/delete/move nodes in UI | Available (MVP subset) |
| Browser run preview | Interprets the lowered IR in-process (joins, loops, dataflow arithmetic); labelled as a preview, never a child process | Experimental |
| IR | Version 0.1, literals, typed variables, equality/inequality/addition, calls, conditionals, loops, unit return, provenance | Partial |
| TypeScript backend | Deterministic generation, source maps | Available for supported IR |
| Build/run | tsc API + Node runtime, structured diagnostics | Available for TypeScript |
| JavaScript/Python/C/C++/Rust/Java/C#/Assembly | Declarative plugin metadata only, no graph lowering | Not claimed |
| HTML/CSS | Templates only | Partial |
| Plugins | Declarative manifests, capability declarations | Available (no executable plugin code) |
| Plugin host | Directory loading, enable/disable, engine-compatible node contributions | Available |
| Templates | Deterministic built-ins, intent ranking, project scaffolding | Available |
| WASM/worker plugins | Not implemented | Unavailable |
| npm libraries | Metadata inspection + best-effort nodes + manual adapters | Experimental |
| AI | Provider interface, local deterministic proposal provider | Experimental, approval-gated |
| Registry | Local metadata, checksum verification, HTTP publish/search | Experimental |
| Registry service | Local HTTP list/search/publish with checksum gate | Experimental |
| Debugging | No DAP adapter yet | Unavailable |
| Desktop shell | Tauri 2 window with scoped file/process IPC; WebView2 default context menu and browser accelerator keys disabled, with frontend guards for reload, find, print, zoom and devtools | Experimental |
| Desktop UI | Studio-style workspace with collapsible output panel and run action in the window header | Experimental |
| Windows bundles | MSI and NSIS `.exe` produced by `pnpm desktop:build`; WebView2 runtime required | Alpha |
| Release pipeline | Code signing, updater, cross-platform release CI | Unavailable |
| Rust core engine | Engine still runs in TypeScript; Rust is only the Tauri shell | Not claimed |
| Collaboration/cloud | Not implemented | Out of scope |

Unsupported constructs produce structured diagnostics; they are never silently omitted.
