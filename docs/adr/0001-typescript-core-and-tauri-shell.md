# ADR 0001: TypeScript core with a Tauri shell

- Status: Accepted (supersedes the earlier Rust-core proposal)
- Date: 2026-11-25

## Context

The original plan proposed a Rust core with React UI in Tauri. The first implementation goal is a complete, testable vertical slice: graph editing, validation, IR lowering, code generation, build/run, plugins and workspace UI.

## Decision

Keep the domain core in strict TypeScript (`@visulith/engine`, `@visulith/core`) and use Tauri 2 only as the desktop shell and scoped IPC provider. The same frontend runs in a browser for development. Rust commands are limited to file access inside app data and process execution; they contain no graph or compiler semantics.

## Consequences

Positive: one type system across graph model, IR, backends, plugin API and UI; faster delivery of a working slice; generated types can be shared with plugins.

Trade-offs: CPU-heavy analysis may eventually need a Rust or WASM accelerator. The shell must keep IPC boundaries strict. Revisit when profiling shows a real bottleneck or plugin isolation requirements exceed what declarative manifests can provide.
