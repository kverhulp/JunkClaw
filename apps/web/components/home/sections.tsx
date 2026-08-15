"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Reveal, SpotlightCard } from "../ui/motion";
import { cx } from "../ui/primitives";

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

  const hasAdvanced = useRef(false);
  const barRef = useRef<HTMLSpanElement>(null);

  /**
   * Bumped when the tab becomes visible again, to restart the dwell.
   *
   * requestAnimationFrame is suspended while a tab is hidden, so the rotator
   * correctly freezes — but the start timestamp keeps ageing. Without this,
   * coming back after five minutes would blow through the elapsed check and
   * snap to the next row instantly. Restarting gives the returning reader a
   * full dwell on whatever they left on.
   */
  const [resumeKey, setResumeKey] = useState(0);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") setResumeKey((key) => key + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /**
   * One requestAnimationFrame clock drives both the advance and the progress
   * rule.
   *
   * Running the bar off a CSS animation and the advance off a timer would let
   * them drift — and worse, pausing would freeze one and not the other. Sharing
   * a clock means the rule always shows the actual time remaining.
   *
   * The bar is written straight to the DOM rather than through state: this
   * updates every frame, and re-rendering the whole rotator sixty times a
   * second to move one line would be absurd.
   */
  useEffect(() => {
    if (paused) return;

    // First row holds for 2s, not 4.2s. At a flat interval the band sits on row
    // one long enough that the page reads as broken rather than as paced.
    const hold = hasAdvanced.current ? 4200 : 2000;
    const FADE_MS = 280;

    let frame = 0;
    let fadeTimer = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / hold);
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
        return;
      }

      setVisible(false);
      fadeTimer = window.setTimeout(() => {
        setIndex((current) => (current + 1) % AGENTS.length);
        setVisible(true);
        hasAdvanced.current = true;
      }, FADE_MS);
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fadeTimer);
    };
  }, [paused, index, resumeKey]);

  /** Jumping to a row restarts its dwell, so the rule matches what you chose. */
  function show(next: number) {
    if (next === index) return;
    setVisible(false);
    hasAdvanced.current = true;
    window.setTimeout(() => {
      setIndex(next);
      setVisible(true);
    }, 120);
  }

  const agent = AGENTS[index]!;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      tabIndex={0}
      aria-label="Agent capabilities, rotating. Hover or focus to pause."
      /**
       * Sized to the text, not to the column. Pausing on hover is right for
       * readability, but a pause target the width of the whole hero means a
       * cursor resting anywhere nearby stops the rotation — which looks
       * identical to being broken.
       */
      className="inline-block max-w-[352px]"
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

      {/* The rule fills over the dwell, so "how long until the next one" is
          visible rather than guessed. It is a 2px line — the system's own
          vocabulary, not a widget borrowed from somewhere else. */}
      <div className="mt-3 h-0.5 w-full bg-neutral-300">
        <span
          ref={barRef}
          aria-hidden
          className="block h-full origin-left bg-accent"
          style={{ transform: "scaleX(0)" }}
        />
      </div>

      {/* Numbered rather than dots: six is enough that "which one was the
          research agent" is a real question, and a number can be aimed at. */}
      <div className="mt-2 flex items-center gap-1">
        {AGENTS.map((agent, position) => {
          const active = position === index;
          return (
            <button
              key={agent.label}
              type="button"
              onClick={() => show(position)}
              aria-label={`Show ${agent.label.toLowerCase()}`}
              aria-current={active ? "true" : undefined}
              className={cx(
                "tabular cursor-pointer px-1 py-0.5 text-[11px] transition-colors duration-150 ease-out",
                active ? "font-extrabold text-accent-700" : "text-text-muted hover:text-text",
              )}
            >
              {String(position + 1).padStart(2, "0")}
            </button>
          );
        })}
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
