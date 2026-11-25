# Visulith desktop shell

Tauri 2 shell that hosts the `@visulith/web` frontend and exposes a small, scoped IPC surface:

- `list_projects` – read project manifests from the app data directory.
- `read_file` / `write_file` – project-relative file access with parent-path rejection.
- `run_program` – execute a generated script with the selected runtime and return structured output.

Development:

```powershell
pnpm --filter @visulith/web dev
cargo tauri dev --manifest-path apps/desktop/src-tauri/Cargo.toml
```

The Rust shell intentionally contains no graph or compiler semantics. Those live in `@visulith/engine` and are used by the frontend. The core was kept in TypeScript for the first complete slice; see `docs/adr/0003-typescript-core-and-tauri-shell.md`.
