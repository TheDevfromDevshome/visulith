# ADR 0002: Generated source is derived output

- Status: Accepted
- Date: 2026-11-25

## Context

Graph-authored modules can be lowered to TypeScript, but arbitrary source cannot be losslessly converted back into graphs. Users may also hand-edit generated code.

## Decision

Graph documents are the source of truth for graph-authored modules. Generated TypeScript is written to an output directory, is gitignored by default and is never silently treated as hand-authored source. Source-authored modules are never overwritten unless the user explicitly accepts a generated change. Every generated statement carries graph/node provenance and a source map is emitted next to the output.

## Consequences

Code generation can be deterministic and reproducible. Diagnostics can be traced back to nodes. Users who want to take over a generated file must do so explicitly, after which ownership changes to source.
