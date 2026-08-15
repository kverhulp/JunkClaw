"use client";

import { useState } from "react";

import { Button } from "../ui/primitives";
import { Reveal } from "../ui/motion";
import { money, titleCase } from "../../lib/format";
import { buildSellerScript, scriptToText } from "../../lib/seller-script";
import type { CatalogueListing } from "../../mocks/vehicles";

/**
 * Negotiation prep.
 *
 * The screen produces a script, not a message. It does not draft outreach, does
 * not propose a number, and has no send path — earlier versions did, and the
 * moment a product composes an offer on someone's behalf it has started giving
 * financial advice with a spending limit bolted on as a guardrail. Handing over
 * the questions is the useful half and none of the liability.
 *
 * Three inputs, all traceable:
 *
 *   1. What similar ones are *asking* — never "market value", never a sale price.
 *   2. What is documented to go wrong on this generation.
 *   3. What service the odometer says has come due.
 *
 * Every question carries why it is being asked, so the user can judge the
 * seller's answer rather than just collecting one.
 */
export function NegotiateView({ listing }: { listing: CatalogueListing }) {
  const [copied, setCopied] = useState(false);
  const script = buildSellerScript(listing);

  const title = `${listing.vehicle.year} ${titleCase(listing.vehicle.make)} ${titleCase(
    listing.vehicle.model,
  )}${listing.vehicle.trim ? ` ${titleCase(listing.vehicle.trim)}` : ""}`;

  // Clipboard only. Nothing leaves the browser, which is the entire send story.
  async function copy() {
    try {
      await navigator.clipboard.writeText(scriptToText(listing, script));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  const questionCount = script.sections.reduce(
    (total, section) => total + section.questions.length,
    0,
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <Reveal>
        {/* Sticks while the questions scroll: the facts are what you check an
            answer against, and scrolling back up to re-read the comps mid-call
            is the moment you lose your place in the list. */}
        <div className="flex flex-col gap-8 lg:sticky lg:top-20">
          <div>
            <h3 className="mb-1">{title}</h3>
            <p className="text-[13px] text-text-secondary">
              Negotiation prep · {listing.location.city}, {listing.location.region}
            </p>
          </div>

          <section aria-labelledby="market">
            <h4 id="market" className="mb-3 text-[15px]">
              Where the price sits
            </h4>

            <dl className="flex flex-col">
              {script.facts.map((fact) => (
                <div
                  key={fact.label}
                  className="flex items-baseline justify-between gap-3 border-b border-divider py-2 text-[13px]"
                >
                  <dt className="text-text-secondary">{fact.label}</dt>
                  <dd className="tabular m-0 font-semibold">{fact.value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-[12px] text-text-secondary">
              {script.marketLine ??
                "Not enough comparable listings nearby to say what similar ones ask. The script asks about price instead of stating one."}
            </p>
            <p className="mt-1.5 text-[12px] text-text-muted">
              Asking prices, not sale prices.
            </p>
          </section>

          {script.knownIssues.length > 0 ? (
            <section aria-labelledby="known">
              <h4 id="known" className="mb-3 text-[15px]">
                Known on this generation
              </h4>
              <ul className="flex list-none flex-col gap-3 p-0">
                {script.knownIssues.map((issue) => (
                  <li key={issue.title} className="border-l-2 border-divider pl-3">
                    <p className="m-0 text-[13px] font-semibold">{issue.title}</p>
                    <p className="m-0 mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                      {issue.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section aria-labelledby="known">
              <h4 id="known" className="mb-2 text-[15px]">
                Known on this generation
              </h4>
              <p className="m-0 text-[12px] text-text-secondary">
                Nothing widely documented for this model and year. That is not a clean bill of
                health — it means the service history and the inspection carry the weight here.
              </p>
            </section>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="border-2 border-divider">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-divider px-4 py-3">
            <div>
              <h2 className="m-0 text-[20px] font-extrabold">Questions for the seller</h2>
              <p className="m-0 text-[12px] text-text-secondary">
                {questionCount} questions · nothing is sent for you, and no offer is made
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? "Copied" : "Copy script"}
            </Button>
          </div>

          <div className="flex flex-col">
            {script.sections.map((section) => (
              <section key={section.title} className="border-b border-divider px-4 py-4 last:border-b-0">
                <h4 className="micro m-0 text-text-muted">{section.title}</h4>
                {section.note ? (
                  <p className="m-0 mt-1.5 text-[12px] text-text-secondary">{section.note}</p>
                ) : null}

                <ol className="mt-3 flex list-none flex-col gap-3 p-0">
                  {section.questions.map((question) => (
                    <li key={question.ask} className="flex gap-3">
                      <span
                        aria-hidden
                        className="mt-0.5 h-1.5 w-1.5 shrink-0 bg-accent"
                      />
                      <div>
                        <p className="m-0 text-[14px] leading-relaxed">{question.ask}</p>
                        <p className="m-0 mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                          {question.why}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </div>

        <p className="mt-3 text-[12px] text-text-muted">
          Information, not advice. AutoScout does not tell you what to offer and does not contact
          anyone on your behalf — the {money(listing.priceCents)} asking price and the questions
          above are what it knows.
        </p>
      </Reveal>
    </div>
  );
}
