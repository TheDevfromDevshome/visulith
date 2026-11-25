# @visulith/language-typescript

A declarative TypeScript language plugin manifest (`plugin.json`) plus a small
TypeScript module of honest capability declarations.

- Enabled: source editing, syntax highlighting, completion, diagnostics,
  formatting, navigation, refactoring (Partial), project detection (Partial),
  build, run, IR export (Experimental), visual nodes (Experimental).
- Disabled: debug, IR import, dependency management (requires an external tool).
- Toolchain hints describe how a host *could* detect `node`, `tsc` and `npm`.
  This package does not spawn those commands or modify dependencies.

The manifest is data only; the MVP plugin host does not execute plugin code.
