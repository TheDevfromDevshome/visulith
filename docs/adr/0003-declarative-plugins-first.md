# ADR 0003: Declarative plugins first

- Status: Accepted
- Date: 2026-11-25

## Context

The plugin system is a first-class requirement, but executing untrusted third-party code in the host process is unsafe.

## Decision

The first plugin host loads declarative JSON manifests only. Plugins may contribute node definitions, language metadata, templates and capability declarations. No plugin code is executed. Manifests declare host API ranges, categories, capabilities and permissions; incompatible or invalid plugins are reported and disabled instead of loaded. WASM or worker-based execution is deferred until a concrete plugin needs computation.

## Consequences

Plugin installation is cheap, auditable and safe by default. Computation-heavy or process-based integrations remain external tools invoked by the toolchain service. The limitation must be shown in the UI rather than claimed as full plugin support.
