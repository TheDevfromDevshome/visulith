# @visulith/plugin-host

A small, deterministic host for **declarative JSON plugin manifests**.

## Scope (honest limitations)

- The host reads `plugin.json` files from a directory or a single manifest file.
- It validates manifests, checks `hostApi` ranges, and reports structured diagnostics.
- It can enable/disable plugins, disclose declared permissions, and aggregate
  declarative node contributions into a `Map<string, NodeDefinitionContribution>`
  that is structurally compatible with `@visulith/engine`'s `NodeDefinitionRegistry`.
- **MVP execution model: manifests only.** The host never imports a plugin
  module, never evaluates JavaScript/TypeScript from a plugin, and never calls
  the contribution provider interfaces in `@visulith/plugin-api`. Those
  interfaces are type-level placeholders for a future host, not active APIs.
- Permissions are displayed for human review. They are not granted, enforced,
  or silently trusted. A future host must design an explicit approval flow
  before granting any capability.

## Usage

```ts
import { PluginRegistry } from "@visulith/plugin-host";

const registry = new PluginRegistry();
const result = registry.loadDirectory("./plugins");
for (const diagnostic of result.diagnostics) console.error(diagnostic.code, diagnostic.message);

const definitions = registry.nodeDefinitionRegistry(); // pass to engine consumers
console.log(registry.permissionDisclosure());
registry.disable("example.node-pack");
```
