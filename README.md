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
packages/engine/   Graph model, validation, IR, TypeScript backend
apps/cli/          check / generate / run commands
out/               Generated output (derived, gitignored)
```

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
```

The example graph lives in `fixtures/graph-example.json`. Generated output is derived from the graph and is not committed.

## Ownership model

Graph documents are the source of truth for graph-authored modules. Generated TypeScript is derived output written to `out/`; it is never silently treated as hand-authored source. Source-authored modules remain untouched unless the user explicitly accepts a generated change.

## License

Apache-2.0. See [LICENSE](LICENSE).
