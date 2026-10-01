"use client";

import { useOwnerGuard } from "@/components/AccountShell";
import { useActionState } from "react";
import { submitFeedback, type FeedbackState } from "./actions";

const initial: FeedbackState = { ok: false };

export function FeedbackForm() {
  const guard = useOwnerGuard();
  const [state, action, pending] = useActionState(async (previous: FeedbackState, data: FormData): Promise<FeedbackState> => { const ticket = guard.capture(); const result = await guard.run(owner => submitFeedback(previous, data, owner)); return guard.current(ticket) ? result ?? initial : initial; }, initial);
  return (
    <form action={action} className="card">
      <div className="grid cols-2">
        <div className="field">
          <label className="label" htmlFor="stage">Where were you?</label>
          <select className="select" id="stage" name="stage" defaultValue="connection">
            <option value="connection">Connecting an app</option>
            <option value="workflows">Workflow observability</option>
            <option value="golden_sets">Golden Sets</option>
            <option value="evals">Model evaluation</option>
            <option value="approvals">Approvals</option>
            <option value="drift">Drift</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="impact">Impact</label>
          <select className="select" id="impact" name="impact" defaultValue="confusing">
            <option value="blocked">Blocked me</option>
            <option value="confusing">I continued, but it was confusing</option>
            <option value="minor">Minor issue</option>
            <option value="idea">Product idea</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="attempted">What did you try?</label>
        <textarea className="textarea" id="attempted" name="attempted" minLength={5} maxLength={4000} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="expected">What did you expect?</label>
        <textarea className="textarea" id="expected" name="expected" minLength={5} maxLength={4000} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="actual">What happened instead?</label>
        <textarea className="textarea" id="actual" name="actual" minLength={5} maxLength={4000} required />
      </div>

      <div className="grid cols-2">
        <div className="field">
          <label className="label" htmlFor="framework">App/framework (optional)</label>
          <input className="input" id="framework" name="framework" maxLength={100} placeholder="LangGraph, Vercel AI SDK, custom…" />
        </div>
        <div className="field">
          <label className="label" htmlFor="captureMode">Capture mode</label>
          <select className="select" id="captureMode" name="captureMode" defaultValue="not_sure">
            <option value="metadata">Metadata</option>
            <option value="inputs">Inputs</option>
            <option value="full">Full</option>
            <option value="not_sure">Not sure</option>
          </select>
        </div>
      </div>

      <label className="row small" style={{ alignItems: "flex-start", margin: "6px 0 16px" }}>
        <input type="checkbox" name="confirmSafe" value="yes" required />
        <span>I removed API/provider keys, customer prompts, private outputs and personal data.</span>
      </label>

      {state.error && <div className="alert danger" style={{ marginBottom: 14 }}>{state.error}</div>}
      {state.ok && <div className="alert success" style={{ marginBottom: 14 }}>Feedback saved. Thank you—this is visible only inside your Blindspot project and the beta database.</div>}
      <button className="btn primary" disabled={pending}>{pending ? "Sending…" : "Send feedback"}</button>
    </form>
  );
}
