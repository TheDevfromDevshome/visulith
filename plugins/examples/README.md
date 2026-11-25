# Example declarative node pack

`plugin.json` is a sample plugin manifest for `@visulith/plugin-host`.

- It declares two node definitions (`examples.number-format` and
  `examples.string-upper`) with typed ports and properties.
- It declares **no code entry point**. The MVP host never imports or executes
  plugin modules; all contributions here are JSON data.
- Port types use the engine's structured `TypeRef` shape, e.g.
  `{ "kind": "primitive", "name": "core.f64" }`.
- The nodes are intentionally metadata-only: no IR lowering is claimed.

Point a `PluginRegistry` at the directory containing this manifest to load it:

```ts
const registry = new PluginRegistry();
registry.loadFile("./plugins/examples/plugin.json");
const definitions = registry.nodeDefinitionRegistry();
```
