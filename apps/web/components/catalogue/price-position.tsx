"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";

import type { Analysis } from "@junkclaw/schema";

import { money } from "../../lib/format";

/**
 * Where this asking price sits among comparable asking prices.
 *
 * The rail spans p25–p75 with the median marked, and the listing's own price
 * sits somewhere along it. The animation is the point: the marker travelling to
 * its position is what makes the relationship legible at a glance, in a way the
 * bare number "−$1,400" is not.
 *
 * Prices outside the interquartile range are clamped to the ends rather than
 * overflowing — the rail shows position within the normal band, and "at or past
 * the edge" is the honest reading for anything beyond it.
 */
export function PricePosition({
  priceCents,
  analysis,
}: {
  priceCents: number;
  analysis: Analysis;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });
  const reduced = useReducedMotion();

  const { p25PriceCents, p75PriceCents, medianPriceCents } = analysis.comps;
  const span = p75PriceCents - p25PriceCents;

  // A degenerate band (every comp the same price) has no position to show.
  if (span <= 0) return null;

  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const position = clamp(((priceCents - p25PriceCents) / span) * 100);
  const medianPosition = clamp(((medianPriceCents - p25PriceCents) / span) * 100);
  const below = priceCents < medianPriceCents;

  return (
    <div ref={ref} className="flex flex-col gap-1.5">
      <div className="relative h-1.5 rounded-full bg-neutral-300">
        {/* Median tick: the reference the delta is measured from. */}
        <span
          aria-hidden
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-line-strong"
          style={{ left: `${medianPosition}%` }}
        />

        <motion.span
          aria-hidden
          initial={reduced ? false : { left: "0%", opacity: 0 }}
          animate={inView ? { left: `${position}%`, opacity: 1 } : undefined}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
            below ? "bg-accent" : "bg-accent"
          }`}
          style={reduced ? { left: `${position}%` } : undefined}
        />
      </div>

      <div className="flex justify-between text-[11px] text-text-muted">
        <span className="tabular">{money(p25PriceCents)}</span>
        <span className="tabular">{money(p75PriceCents)}</span>
      </div>

      <p className="sr-only">
        Asking {money(priceCents)}, against a comparable range of{" "}
        {money(p25PriceCents)} to {money(p75PriceCents)} with a median of{" "}
        {money(medianPriceCents)}.
      </p>
    </div>
  );
}
