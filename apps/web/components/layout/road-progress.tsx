"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A car driving a single-lane road along the bottom of the page.
 *
 * It is a scroll indicator before it is an ornament: the car's position is how
 * far down the page you are, so the motion carries information rather than
 * decorating. That is also why it survives the project's no-decoration rule —
 * the road is a 2px rule, which is the system's own structural device, and the
 * car is flat with square edges like everything else.
 *
 * Position is written straight to the DOM inside a rAF callback rather than
 * held in state: scrolling fires constantly, and re-rendering the tree on every
 * scroll event to move one element would be wasteful.
 */
export function RoadProgress() {
  const carRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    /**
     * Layout is measured on mount and resize, never during a scroll.
     *
     * Reading clientWidth or scrollHeight forces the browser to flush layout;
     * doing that on every scroll event is how a smooth page starts stuttering.
     * Cached here, the scroll handler only writes a transform, which is cheap
     * and does not invalidate layout.
     */
    let distance = 0;
    let scrollRange = 0;

    const measure = () => {
      scrollRange = document.documentElement.scrollHeight - window.innerHeight;
      distance = (trackRef.current?.clientWidth ?? 0) - (carRef.current?.offsetWidth ?? 0);

      // A page that does not scroll has no progress to show, and a car parked
      // at the kerb for no reason is exactly what this design system avoids.
      setScrollable(scrollRange > 120);
    };

    const draw = () => {
      if (scrollRange <= 0 || !carRef.current) return;
      const progress = Math.min(1, Math.max(0, window.scrollY / scrollRange));
      carRef.current.style.transform = `translateX(${progress * distance}px)`;
    };

    measure();
    draw();

    // Written directly rather than deferred to requestAnimationFrame: rAF is
    // suspended in background tabs, and a position that silently stops updating
    // is worse than one write per event that only touches a transform.
    const remeasure = () => {
      measure();
      draw();
    };

    window.addEventListener("scroll", draw, { passive: true });
    window.addEventListener("resize", remeasure);

    // Content can change height after mount — the mock queries resolve at
    // ~450ms and add rows — so re-measure rather than trusting the first read.
    const observer = new ResizeObserver(remeasure);
    observer.observe(document.documentElement);

    return () => {
      window.removeEventListener("scroll", draw);
      window.removeEventListener("resize", remeasure);
      observer.disconnect();
    };
  }, []);

  if (!scrollable) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-6 select-none"
    >
      {/* The road. A 2px rule, same as every other divider on the page. */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-divider" />

      <div ref={trackRef} className="relative h-full">
        <div
          ref={carRef}
          className="absolute bottom-0.5 left-0 will-change-transform"
          style={{ transform: "translateX(0px)" }}
        >
          <Car />
        </div>
      </div>
    </div>
  );
}

/**
 * Flat side elevation, square edges, one accent fill — drawn to the same rules
 * as the rest of the system rather than as a piece of clip art.
 */
function Car() {
  return (
    <svg width="34" height="16" viewBox="0 0 34 16" fill="none">
      {/* Cabin, then body: two rectangles, no curves. */}
      <path d="M9 3h11l4 4H9V3Z" fill="var(--color-accent)" />
      <path d="M1 7h31v5H1V7Z" fill="var(--color-accent)" />
      <circle cx="9" cy="12.5" r="2.5" fill="var(--color-text)" />
      <circle cx="25" cy="12.5" r="2.5" fill="var(--color-text)" />
    </svg>
  );
}
