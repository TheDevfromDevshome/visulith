# @visulith/registry

A local registry client backed by `fixtures/registry/index.json`.

- Metadata includes checksum, publisher, license, compatibility, permissions and provenance.
- Artifacts are verified with `node:crypto` SHA-256 **before** `installPackage`
  copies anything into a target directory.
- Search supports free text and category filtering.

```ts
import { LocalRegistryClient } from "@visulith/registry";

const client = new LocalRegistryClient();
const result = client.installPackage("example.node-pack", "./out");
```

A tampered checksum returns `REGISTRY_CHECKSUM_MISMATCH` and writes no file.
