"use client";

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "./primitives";

/**
 * Motion primitives, in the Motion Primitives / Magic UI idiom but stripped of
 * what this project bans: no glassmorphism, no glowing borders, no gradient
 * blurs, no particle canvases, no 3D.
 *
 * What survives that filter is the part that was doing real work anyway —
 * revealing content as it arrives, counting a figure up so the eye lands on it,
 * and letting a card acknowledge the cursor. Everything here is a no-op under
 * `prefers-reduced-motion`, and none of it moves layout.
 */

/* --------------------------------------------------------- Scroll reveal */

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Same reasoning as the odometer: trigger when the element is meaningfully in
  // view, not when its first pixel clips the fold.
  const inView = useInView(ref, { once: true, margin: "-12% 0px -12% 0px" });
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------- Animated number */

/**
 * Counts a figure up once it scrolls into view.
 *
 * Renders the final value immediately in the DOM for screen readers and for
 * anyone with reduced motion — the animation is decoration over a number that
 * is already correct, never the source of it.
 */
export function AnimatedNumber({
  value,
  suffix = "",
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  const spring = useSpring(0, { stiffness: 90, damping: 20, mass: 0.6 });
  const rounded = useTransform(spring, (latest) => Math.round(latest));

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    if (inView) spring.set(value);
  }, [inView, reduced, spring, value]);

  useEffect(() => rounded.on("change", (latest) => setDisplay(latest)), [rounded]);

  return (
    <span ref={ref} className={className}>
      {display.toLocaleString("en-CA")}
      {suffix}
    </span>
  );
}

/* --------------------------------------------------------- Odometer digits */

const DIGIT_HEIGHT_EM = 1.15;

/**
 * A figure whose digits roll into place like a mechanical counter.
 *
 * Reads more engineering-grade than a number blurring upward, and it suits a
 * product about cars. Each column holds 0–9 stacked vertically and slides to
 * the target digit; columns stagger slightly from the right so the roll travels
 * across the number rather than snapping as a block.
 *
 * The true value sits in a visually-hidden span, so assistive technology and
 * copy-paste both get the number rather than a strip of digits.
 */
export function OdometerNumber({
  value,
  suffix = "",
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  /**
   * The margin is load-bearing, not a tweak.
   *
   * Without it, `useInView` fires the moment one pixel enters the viewport —
   * and this strip sits right at the fold, so the roll ran and finished while
   * the reader was still on the headline. Requiring the element to be 20% into
   * the viewport means it animates when someone is actually looking at it.
   */
  const inView = useInView(ref, { once: true, margin: "-20% 0px -20% 0px" });
  const reduced = useReducedMotion();

  const formatted = value.toLocaleString("en-CA");
  const characters = formatted.split("");

  if (reduced) {
    return (
      <span ref={ref} className={className}>
        {formatted}
        {suffix}
      </span>
    );
  }

  return (
    <span ref={ref} className={cx("inline-flex items-baseline", className)}>
      <span className="sr-only">
        {formatted}
        {suffix}
      </span>

      <span aria-hidden className="inline-flex">
        {characters.map((character, index) => {
          const digit = Number.parseInt(character, 10);
          if (Number.isNaN(digit)) {
            // Separators do not roll — only the digits do.
            return (
              <span key={`sep-${index}`} className="inline-block">
                {character}
              </span>
            );
          }

          return (
            <span
              key={`digit-${index}`}
              className="inline-block overflow-hidden"
              style={{ height: `${DIGIT_HEIGHT_EM}em` }}
            >
              <motion.span
                className="flex flex-col"
                initial={{ y: 0 }}
                animate={inView ? { y: `-${digit * DIGIT_HEIGHT_EM}em` } : undefined}
                transition={{
                  duration: 0.9,
                  ease: [0.16, 1, 0.3, 1],
                  // Right-most digits settle first, so the roll reads across.
                  delay: (characters.length - index) * 0.04,
                }}
              >
                {Array.from({ length: 10 }, (_, tick) => (
                  <span
                    key={tick}
                    style={{ height: `${DIGIT_HEIGHT_EM}em` }}
                    className="flex items-center justify-center"
                  >
                    {tick}
                  </span>
                ))}
              </motion.span>
            </span>
          );
        })}
      </span>

      {/* whitespace-pre: a leading space in the suffix collapses after an
          inline-flex sibling, which turns "1 of 3" into "1of 3". */}
      {suffix ? (
        <span aria-hidden className="whitespace-pre">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------- Crossfade */

/**
 * Swaps skeleton for content without the hard cut.
 *
 * Keyed on a state string rather than on the data, so React does not reuse the
 * skeleton's DOM for the real thing — that reuse is what produces the flicker
 * this exists to remove.
 */
export function Crossfade({
  state,
  children,
}: {
  state: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={state}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------- Spotlight */

/**
 * A card that follows the cursor with a faint warm wash.
 *
 * The Magic UI version of this is a saturated neon glow. Here it is cream at
 * 6% over a radius wide enough that you register it as lighting rather than as
 * a shape — it should read as the surface catching light, not as an effect.
 */
export function SpotlightCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const reduced = useReducedMotion();

  return (
    <div
      ref={ref}
      onMouseMove={(event) => {
        if (reduced) return;
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setPosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}
      onMouseLeave={() => setPosition(null)}
      className={cx("relative overflow-hidden", className)}
    >
      {position ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(320px circle at ${position.x}px ${position.y}px, rgb(0 0 0 / 0.04), transparent 70%)`,
          }}
        />
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ Overlay fade */

/** Shared entrance for drawers and modals. Transform and opacity only. */
export const OVERLAY_MOTION = {
  backdrop: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
  },
  panelRight: {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 24 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
  },
  panelCentre: {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
    transition: { duration: 0.15, ease: [0.16, 1, 0.3, 1] as const },
  },
} as const;

export { motion };
