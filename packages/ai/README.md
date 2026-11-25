# @visulith/ai

A provider-independent proposal layer. Providers return **structured data**:
a diff preview and concrete graph mutations. Nothing is applied automatically.

```ts
import { AIService, LocalEchoProvider } from "@visulith/ai";

const service = new AIService();
service.registerProvider(new LocalEchoProvider());
const proposal = service.requestProposal("local-echo", { prompt: "log hello", graph });
const result = await service.applyProposal(proposal, { prompt: "log hello", graph }, (p) => userApproves(p.diffPreview));
```

`LocalEchoProvider` is deterministic and rule-based: it does not call a model.
`AIService.applyProposal` requires an explicit approval callback, never mutates
the input graph, and never writes files or executes code.
