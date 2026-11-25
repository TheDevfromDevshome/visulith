# @visulith/registry-service

A dependency-free Node HTTP service backed by a JSON file (`data/registry.json`
by default).

Routes:

- `GET /packages` — list all published package metadata.
- `GET /packages/:id` — one package, or a structured 404.
- `POST /packages` — publish `{ "metadata": {...}, "artifactPath": "file.json" }`.
  The service recomputes SHA-256 from the artifact file and rejects the publish
  with `CHECKSUM_MISMATCH` if it differs. `artifactPath` must name a file
  directly inside the registry data directory.

```ts
import { startServer } from "@visulith/registry-service";

const { server, port } = await startServer("./data/registry.json", 0);
```

The service does not execute artifacts. Tests start it on port 0 and use
`node:http` requests.
