# Implemented architecture

```text
React workspace (apps/web)
        |  typed bridge (web storage | Tauri IPC)
        v
Application packages
  core:        project manifest, workspace, commands, settings
  engine:      graph model, validation, IR 0.1, TypeScript backend
  toolchain:   tool detection, structured processes, build/run tasks
  plugin-api:  versioned manifests, capabilities, contribution contracts
  plugin-host: validation, compatibility, enable/disable, contributions
  templates:   built-in templates and recommendations
  library-npm: npm metadata inspection and manual adapters
  language-typescript: declarative language plugin
  ai:          provider-independent proposals with approval gates
  registry:    local package metadata, checksums, client + HTTP service
        v
External tools: node, tsc, npm, optional language servers/debuggers
        v
Tauri 2 shell (apps/desktop): scoped file access and process execution
```

## Boundaries

- Domain packages never import UI code.
- Generated output is derived; project files are the source of truth.
- Plugins declare capabilities; no plugin code runs in the host.
- Toolchain calls are structured, cancellable and preserve raw output.
- AI providers never modify files or execute commands without explicit approval.

## Data flow for a graph-authored module

1. Frontend edits a graph document (`schemaVersion` 0.1).
2. `engine` validates structure, ports, types and the linear execution chain.
3. `engine` lowers supported nodes into IR 0.1 with graph/node provenance.
4. The TypeScript backend emits deterministic source and a line-level source map.
5. `toolchain` compiles through the TypeScript API and runs the result with Node.
6. Diagnostics and program output return through the bridge to the UI.
