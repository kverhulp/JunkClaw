"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Reveal, SpotlightCard } from "../ui/motion";

/**
 * Ported from AutoScout/JunkClaw Dashboard.dc.html.
 *
 * Structure, copy, and motion timings match the DC mockup: hero, a single-band
 * agent rotator in the right column, and a three-column feature row above the
 * footer. No stat strip and no listing ticker — the mockup has neither, and the
 * point of this port is that the two stop drifting.
 */

const AGENTS = [
  {
    label: "LISTING EXTRACTOR",
    copy: "Reads your own Facebook session into one normalised shape.",
  },
  {
    label: "COMP CURATOR",
    copy: "Widens the comparison set one dimension at a time, and says how far it had to go.",
  },
  {
    label: "RESEARCH",
    copy: "Known issues, maintenance intervals, and what the model actually costs to keep.",
  },
  {
    label: "RISK ANALYST",
    copy: "Flags salvage titles, rust, and needs-work — each with the sentence that triggered it.",
  },
  {
    label: "NEGOTIATION",
    copy: "Drafts the message you send. You approve every one, and the ceiling is enforced in code.",
  },
  {
    label: "CRITERIA INTERPRETER",
    copy: 'Turns "Civic under $8k, no rust" into the filters that drive everything else.',
  },
];

const FEATURES = [
  {
    title: "Triage, not listings",
    copy: "Scored vs. similar asking prices — never sold prices, never a guess.",
  },
  {
    title: "Honest when it's thin",
    copy: '"Not enough data" is a real answer. It\'s never shown as $0.',
  },
  {
    title: "You approve every message",
    copy: "A spending ceiling enforced in code, not left to a prompt.",
  },
];

export function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-20 pt-10">
      <Reveal>
        <h1 className="mb-8 text-[34px]">Two hundred listings. Three worth your evening.</h1>
      </Reveal>

      <div className="grid gap-8 md:grid-cols-[minmax(0,480px)_1fr]">
        <div>
          <Reveal delay={0.06}>
            <p className="mb-6 max-w-[52ch] text-[15px] leading-relaxed text-text-secondary">
              AutoScout rides along while you shop for a used car on Facebook Marketplace. It
              scores every listing against real comparable asking prices, flags the risks, and
              drafts the message you send the seller — with spending limits enforced in code, not
              in a prompt.
            </p>
          </Reveal>

          <Reveal delay={0.12}>
            <Link
              href="/catalogue"
              className="inline-flex min-h-9 items-center gap-1.5 border border-transparent bg-accent px-3.5 text-[14px] font-extrabold text-bg transition-colors duration-150 ease-out hover:bg-accent-600"
            >
              Connect the extension
            </Link>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <AgentRotator />
        </Reveal>
      </div>

      <FeatureRow />
    </section>
  );
}

/**
 * One agent at a time in a single band, fading and sliding as it swaps.
 *
 * Two deliberate departures from the mockup, both accessibility fixes: it
 * pauses on hover and focus, and the band is an `aria-live` region. Six rows at
 * the mockup's 2.4s gives a reader no chance to finish one, and an unannounced
 * swap is invisible to a screen reader entirely.
 */
function AgentRotator() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;

    const loop = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % AGENTS.length);
        setVisible(true);
      }, 280);
    }, 4200);

    return () => window.clearInterval(loop);
  }, [paused]);

  const agent = AGENTS[index]!;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      tabIndex={0}
      aria-label="Agent capabilities, rotating. Focus to pause."
      className="max-w-[352px]"
    >
      <div className="min-h-[110px] overflow-hidden">
        <div
          aria-live="polite"
          aria-atomic
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(-8px)",
            transition:
              "opacity 0.28s cubic-bezier(0.16,1,0.3,1), transform 0.28s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <h6 className="mb-2 text-[18px] normal-case tracking-normal text-accent-700">
            {agent.label}
          </h6>
          <p className="m-0 max-w-[38ch] text-[16px] leading-relaxed text-text-secondary">
            {agent.copy}
          </p>
        </div>
      </div>

      <div className="tabular mt-3 text-[11px] text-text-muted">
        {String(index + 1).padStart(2, "0")} / {String(AGENTS.length).padStart(2, "0")}
      </div>
    </div>
  );
}

function FeatureRow() {
  return (
    <div className="mt-3 grid gap-6 border-t-2 border-divider pt-6 md:grid-cols-3">
      {FEATURES.map((feature, index) => (
        <Reveal key={feature.title} delay={index * 0.06}>
          <SpotlightCard className={index > 0 ? "h-full md:border-l-2 md:border-divider md:pl-6" : "h-full"}>
            <h6 className="mb-1.5">{feature.title}</h6>
            <p className="m-0 text-[13px] leading-relaxed text-text-secondary">{feature.copy}</p>
          </SpotlightCard>
        </Reveal>
      ))}
    </div>
  );
}
