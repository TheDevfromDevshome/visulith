# @visulith/library-npm

Best-effort npm dependency inspection. It reads `package.json` and `.d.ts`
files from a directory and produces declarative node contributions compatible
with `@visulith/plugin-api`'s `NodeDefinitionContribution`.

```ts
import { inspectPackage } from "@visulith/library-npm";

const result = inspectPackage("./node_modules/some-package");
// result.partial is always true; review result.nodes before publishing.
```

**Honest limitations:** parsing is regex-based, does not use the TypeScript
compiler, does not load or execute the inspected package, and may miss
overloads, complex generics or mapped types. Generated nodes carry the
`best-effort` and `partial` capabilities. Hand-authored adapters in
`adapters/nodes.json` can patch, exclude, or add nodes.
