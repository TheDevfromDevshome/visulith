# @visulith/templates

Five built-in, data-only project templates:

- `typescript-console`
- `web-app`
- `discord-bot`
- `library-node-pack`
- `blank`

```ts
import { createProjectFiles, recommendTemplate } from "@visulith/templates";

const template = recommendTemplate({ intent: "discord bot", dependencies: ["discord.js"] });
const project = createProjectFiles(template.id, { id: "my-bot", name: "My Bot" });
// project.manifest is a project manifest v0.1; project.files is a list of
// { path, content } pairs. This package never writes files.
```

`recommendTemplate` uses deterministic scoring over intent keywords, language,
and dependency hints. `createProjectFiles` renders `{{variable}}` placeholders
and returns a stable manifest and file list.
