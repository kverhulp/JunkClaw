"use client";

import { useState } from "react";

import { Button, cx } from "../ui/primitives";
import { Reveal } from "../ui/motion";
import { money } from "../../lib/format";

/**
 * Ported from AutoScout/JunkClaw Negotiate.dc.html.
 *
 * Copilot Mode: the agent drafts, a person approves, and only then is anything
 * sent. The two guardrails on this screen are the whole point of it —
 *
 *   1. The message states facts and never instructs an offer. Framed as
 *      information, not advice.
 *   2. The spending ceiling is enforced in code before a draft exists, not by
 *      asking the draft nicely. A model that talks itself past a limit is the
 *      one failure this product cannot ship.
 *
 * The approve action is deliberately inert here: there is no send path yet, and
 * a button that looks like it messages a seller but doesn't would be worse than
 * one that says so.
 */

const CEILING_CENTS = 2_150_000;
const PROPOSED_CENTS = 2_080_000;
const COMP_MEDIAN_CENTS = 2_040_000;

type StepState = "done" | "active" | "pending";

const STEPS: Array<{ title: string; detail: string; state: StepState }> = [
  {
    title: "Listing queued",
    detail: "Matched saved criteria, budget and radius",
    state: "done",
  },
  {
    title: "Draft composed",
    detail: "Comp-grounded, ceiling-checked by the agent",
    state: "done",
  },
  {
    title: "Awaiting your approval",
    detail: "Nothing sends without a human clicking approve",
    state: "active",
  },
  {
    title: "Sent to seller",
    detail: "Not yet sent",
    state: "pending",
  },
];

const DRAFT = `Hi! I'm interested in the Outback. I noticed similar Outbacks in the area are asking around ${money(
  COMP_MEDIAN_CENTS,
)} — would you consider ${money(PROPOSED_CENTS)} for a quick, no-hassle pickup this weekend?`;

export function NegotiateView() {
  const [decision, setDecision] = useState<"pending" | "rejected">("pending");
  const withinCeiling = PROPOSED_CENTS <= CEILING_CENTS;

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-center gap-10 px-6 py-12">
      <Reveal>
        <div className="w-full max-w-[420px]">
          <h3 className="mb-1">2020 Subaru Outback Premium</h3>
          <p className="mb-6 text-[13px] text-text-secondary">
            Negotiation workflow · Cornwall, PE
          </p>

          <ol className="flex flex-col">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden
                    className={cx(
                      "flex h-[22px] w-[22px] shrink-0 items-center justify-center border-2 border-text text-[11px] font-extrabold",
                      step.state === "done" ? "bg-text text-bg" : "bg-bg text-text",
                    )}
                  >
                    {step.state === "done" ? "✓" : index + 1}
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span aria-hidden className="min-h-8 w-0.5 flex-1 bg-divider" />
                  ) : null}
                </div>

                <div className="pb-7">
                  <p className="m-0 text-[14px] font-semibold">
                    {step.title}
                    {step.state === "active" ? (
                      <span className="ml-2 text-[12px] font-normal text-accent-700">
                        — you are here
                      </span>
                    ) : null}
                  </p>
                  <p className="m-0 mt-0.5 text-[12px] text-text-secondary">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="flex w-full max-w-[420px] flex-col gap-3 bg-bg p-4 shadow-lg">
          <h2 className="m-0 text-[20px] font-extrabold">Approve outreach to seller</h2>
          <p className="m-0 text-[12px] text-text-secondary">
            Framed as information, not advice — this message states facts, never an offer
            instruction.
          </p>

          <p className="m-0 bg-neutral-100 p-3.5 text-[13px] leading-relaxed">{DRAFT}</p>

          <div className="flex items-center justify-between border-[1.5px] border-text px-3 py-2.5 text-[13px]">
            <span>Spending ceiling</span>
            <span className="tabular font-extrabold">{money(CEILING_CENTS)}</span>
          </div>

          <p className="m-0 flex items-center gap-2 text-[12px] text-accent-700">
            <span aria-hidden>✓</span>
            Proposed {money(PROPOSED_CENTS)} is within ceiling — enforced in code, not by this
            draft.
          </p>

          {/* The ceiling check is shown as a fact about the draft, not as a
              toggle. If it ever failed, no draft would reach this screen. */}
          {!withinCeiling ? (
            <p className="m-0 border-2 border-accent p-2 text-[12px] text-accent-700">
              Over ceiling — this draft would not have been produced.
            </p>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary">Edit message</Button>
            <Button variant="ghost" onClick={() => setDecision("rejected")}>
              Reject
            </Button>
            <Button variant="primary" disabled title="Sending is not wired up yet">
              Approve &amp; send
            </Button>
          </div>

          <p aria-live="polite" className="m-0 text-right text-[12px] text-text-muted">
            {decision === "rejected"
              ? "Rejected. Nothing was sent."
              : "Sending isn't wired up yet — approving does nothing."}
          </p>
        </div>
      </Reveal>
    </div>
  );
}
