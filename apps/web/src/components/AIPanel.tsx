import { useEffect, useState, type JSX } from "react";
import { Sparkles } from "lucide-react";
import type { GraphDocument } from "@visulith/engine";
import { getBridge } from "../lib/bridge";
import type { AIProvider, ChangeProposal } from "../lib/types";

interface AIPanelProps {
  graph: GraphDocument | null;
  providers: readonly AIProvider[];
  providerId?: string;
  onApply: (graph: GraphDocument) => void;
}

export function AIPanel({ graph, providers, providerId, onApply }: AIPanelProps): JSX.Element {
  const [selectedProvider, setSelectedProvider] = useState<string>(providerId ?? "");
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<ChangeProposal | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedProvider(providerId ?? "");
  }, [providerId]);

  useEffect(() => {
    setProposal(null);
    setReviewed(false);
  }, [graph]);

  const propose = async (): Promise<void> => {
    if (graph === null) return;
    setBusy(true);
    setError(null);
    try {
      const next = await getBridge().proposeChange({
        graph,
        providerId: selectedProvider.length > 0 ? selectedProvider : undefined,
        instruction,
      });
      setProposal(next);
      setReviewed(false);
    } catch (cause: unknown) {
      setProposal(null);
      setError(cause instanceof Error ? cause.message : "The provider could not propose a change.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inspector-content ai-panel">
      <section>
        <h4>Providers</h4>
        {providers.length === 0 && <p className="muted">No providers discovered.</p>}
        <div className="provider-list">
          {providers.map((provider) => (
            <label className={`provider-row${selectedProvider === provider.id ? " is-active" : ""}`} key={provider.id}>
              <input
                type="radio"
                name="ai-provider"
                value={provider.id}
                checked={selectedProvider === provider.id}
                onChange={() => setSelectedProvider(provider.id)}
              />
              <span>
                <strong>{provider.name}</strong>
                <small>{provider.kind} · {provider.description}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h4>Request a change</h4>
        <label className="field">
          <span>Optional instruction</span>
          <textarea
            rows={2}
            value={instruction}
            placeholder="e.g. make the message mention the source map"
            onChange={(event) => setInstruction(event.target.value)}
          />
        </label>
        <button className="button button--primary" type="button" disabled={graph === null || busy} onClick={() => void propose()}>
          <Sparkles size={14} aria-hidden="true" /> {busy ? "Thinking…" : "Propose graph change"}
        </button>
        {error !== null && <p className="inline-error">{error}</p>}
      </section>

      {proposal !== null && (
        <section className="proposal">
          <h4>Proposed change</h4>
          <p>{proposal.summary}</p>
          <p className="muted">Provider: {proposal.providerId} · {proposal.rationale}</p>
          <pre className="diff-preview">{proposal.diff}</pre>
          <label className="approval-check">
            <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
            <span>I reviewed this diff and approve applying it.</span>
          </label>
          <div className="button-row">
            <button className="button button--primary" type="button" disabled={!reviewed} onClick={() => { onApply(proposal.graph); setProposal(null); setReviewed(false); }}>
              Approve &amp; apply
            </button>
            <button className="button button--ghost" type="button" onClick={() => { setProposal(null); setReviewed(false); }}>Dismiss</button>
          </div>
        </section>
      )}
    </div>
  );
}
