# Roadmap

Status reflects implemented code, not ambitions. See [CAPABILITIES.md](CAPABILITIES.md) for honest capability levels.

## Done

- [x] Graph document schema 0.1 with structural, connection, type and semantic validation.
- [x] IR 0.1 with provenance and deterministic TypeScript generation.
- [x] Line-level source maps and explicit unsupported-construct diagnostics.
- [x] Build/run pipeline using native TypeScript compiler and Node.
- [x] CLI check/generate/run.
- [x] Versioned project manifest, atomic saves and backup before overwrite.
- [x] Typed commands, workspace state and settings.
- [x] Declarative plugin API, host, templates, AI service, registry client and npm adapter packages.
- [x] Checksum-gated local registry HTTP service and declarative TypeScript language metadata.
- [x] React workspace UI with graph editor, inspector, diagnostics, code viewer and panels.
- [x] Tauri 2 desktop shell with scoped IPC.
- [x] CI and Apache-2.0 license.

## Next

- [x] Branching/conditional nodes and string variables in the graph subset.
- [ ] Loops and reconverging branches in the graph subset.
- [ ] Additional graph kinds: dataflow, event, composition.
- [ ] Language plugins with real IR mappings (JavaScript first).
- [ ] LSP and DAP adapters.
- [ ] WASM or worker plugin execution with resource limits.
- [ ] Package signing and provenance for the registry.
- [ ] Large-graph performance work and accessibility audit.

Release policy: `0.x` may change project and plugin schemas with migration notes. No `1.0` until the project format, plugin API and supported capability matrix are stable.
