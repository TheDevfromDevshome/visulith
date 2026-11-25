# Security model

- Project files are user data. Writes are atomic and a backup is kept before overwrite.
- The Tauri shell resolves paths relative to app data and rejects parent-directory components.
- Plugins are declarative JSON in the current host. No third-party plugin code is executed.
- Plugins declare permissions; the UI shows them before activation.
- AI providers never write files, run commands or modify graphs without explicit approval.
- Registry artifacts are verified with SHA-256 checksums before installation. A listing is not an endorsement or security audit.
- Toolchain processes run with an explicit working directory, timeout and cancellation support. Raw output is preserved as structured data.
- Generated code is untrusted until the user inspects and approves it.

Report security issues privately through GitHub Security Advisories for this repository.
