# Visulith

**Build anything. Connect everything.**

Visulith is an extensible development environment that combines visual programming, source-code editing and existing toolchains in one workspace. It does not replace compilers or language servers: it connects them through a shared project model and a deliberately scoped intermediate representation.

> This repository currently contains the Phase 0 proof of concept and the beginning of the implementation. The full product roadmap is being worked through in public, one vertical slice at a time.

## Principles

1. Code remains first-class; visual programming must never trap a project.
2. Extensibility is a core requirement.
3. Reuse existing compilers, package managers, language servers and debuggers.
4. Language plugins declare capabilities honestly.
5. Plugins and generated code are untrusted until explicitly approved.
6. Deliver small, working slices before expanding scope.

## Current implementation

The first working slice is the graph-to-TypeScript pipeline:

```text
graph.json → validation → IR 0.1 → deterministic TypeScript → tsc → node
```

Layout:

```text
packages/engine/            Graph model, validation, IR, TypeScript backend
packages/core/              Project manifest, workspace, commands, settings
packages/toolchain/         Tool detection, structured processes, build/run
packages/plugin-api/        Versioned manifest and capability contracts
packages/plugin-host/       Declarative plugin loading and activation
packages/templates/         Built-in project templates
packages/ai/                Provider-independent proposals with approval gates
packages/registry/          Local package metadata and checksum verification
packages/library-npm/       npm inspection and best-effort nodes
packages/language-typescript/ Declarative language plugin
apps/cli/                   check / generate / run / build / project / tools
apps/web/                   React workspace UI
apps/desktop/               Tauri 2 shell with scoped IPC
services/registry/          Local HTTP registry service
fixtures/                   Example graphs, projects, plugins and registry data
out/                        Generated output (derived, gitignored)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/CAPABILITIES.md](docs/CAPABILITIES.md).

## Requirements

- Node.js 22+
- pnpm 10+

## Quick start

```powershell
pnpm install
pnpm build
pnpm test
pnpm verify
```

Work on the UI or desktop shell:

```powershell
pnpm dev:web        # Vite dev server
pnpm desktop:dev    # Tauri window (requires WebView2 on Windows)
```

CLI:

```powershell
pnpm tools          # detect node, npm and tsc
pnpm project:demo   # create a sample project manifest
```

`pnpm verify` builds, runs all tests and executes the example graph. Expected output:

```text
Program output:
Hello, Visulith!
```

Useful commands:

```powershell
pnpm check          # validate the example graph
pnpm generate       # write generated TypeScript plus a source map
pnpm run:example    # generate, compile and run the example
pnpm registry:dev   # start the local package registry service
```

The example graph lives in `fixtures/graph-example.json`. Additional fixtures cover `graph-branching.json`, `graph-join.json` (reconverging branches), `graph-loop.json` (repeat loop) and `graph-dataflow.json` (integer arithmetic); all can be passed to the same CLI commands. Generated output is derived from the graph and is not committed.

## Ownership model

Graph documents are the source of truth for graph-authored modules. Generated TypeScript is derived output written to `out/`; it is never silently treated as hand-authored source. Source-authored modules remain untouched unless the user explicitly accepts a generated change.

## License

Apache-2.0. See [LICENSE](LICENSE).
