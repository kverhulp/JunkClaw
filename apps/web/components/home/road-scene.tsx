/**
 * The road band, ported from JunkClaw Dashboard.dc.html.
 *
 * Full-bleed strip between the hero and the footer: hills and trees behind, a
 * road with a dashed centre line, and two cars passing in opposite directions
 * with their wheels turning. Geometry, colours, and timings are copied from the
 * mockup rather than reinterpreted — the point of porting is that the two stop
 * drifting.
 *
 * Purely decorative, so the whole thing is `aria-hidden` and it holds no state.
 * The animations are CSS, which means they cost nothing in JavaScript and stop
 * on their own under `prefers-reduced-motion` (see globals.css).
 */
export function RoadScene() {
  return (
    <div
      aria-hidden
      className="relative h-[72px] overflow-hidden border-y-2 border-divider bg-surface"
    >
      {/* Hills and trees. preserveAspectRatio="none" so the scene stretches to
          any width rather than letterboxing. */}
      <svg
        width="100%"
        height="56"
        viewBox="0 0 400 56"
        preserveAspectRatio="none"
        className="absolute left-0 top-0 h-14 w-full"
      >
        <polygon points="0,56 40,20 80,56" fill="var(--color-neutral-300)" />
        <polygon points="60,56 110,14 170,56" fill="var(--color-neutral-300)" />
        <polygon points="300,56 340,24 380,56" fill="var(--color-neutral-300)" />

        <rect x="148" y="42" width="2" height="14" fill="var(--color-neutral-400)" />
        <polygon points="149,24 143,44 155,44" fill="var(--color-neutral-400)" />
        <polygon points="149,32 144,48 154,48" fill="var(--color-neutral-400)" />

        <rect x="228" y="42" width="2" height="14" fill="var(--color-neutral-400)" />
        <polygon points="229,24 223,44 235,44" fill="var(--color-neutral-400)" />
        <polygon points="229,32 224,48 234,48" fill="var(--color-neutral-400)" />

        <rect x="21" y="46" width="2" height="10" fill="var(--color-neutral-400)" />
        <polygon points="22,32 17,48 27,48" fill="var(--color-neutral-400)" />

        <rect x="361" y="46" width="2" height="10" fill="var(--color-neutral-400)" />
        <polygon points="362,32 357,48 367,48" fill="var(--color-neutral-400)" />
      </svg>

      {/* Road surface, then the centre line painted on top of it. */}
      <div className="absolute inset-x-0 top-14 h-4 bg-neutral-300" />
      <div
        className="absolute inset-x-0 top-14 h-0.5"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, var(--color-neutral-100) 0 26px, transparent 26px 48px)",
        }}
      />

      <Car direction="right" />
      <Car direction="left" />
    </div>
  );
}

/**
 * The two cars differ in more than heading: the near one is accent-bodied with
 * dark wheels, the far one dark-bodied with accent wheels, and they run at
 * different speeds. Identical cars at identical speeds would read as a loop.
 */
function Car({ direction }: { direction: "right" | "left" }) {
  const towardsRight = direction === "right";

  const body = towardsRight ? "var(--color-accent)" : "var(--color-text)";
  const wheel = towardsRight ? "var(--color-text)" : "var(--color-accent)";

  return (
    <svg
      width="64"
      height="28"
      viewBox="0 0 64 28"
      className="absolute left-0 top-14"
      style={{
        marginTop: towardsRight ? "-24px" : "-16px",
        animation: `${towardsRight ? "drive-across" : "drive-across-reverse"} ${
          towardsRight ? "11s" : "17s"
        } linear infinite`,
      }}
    >
      <rect x="4" y="12" width="56" height="10" fill={body} />
      <path d="M14 12 L20 3 H40 L46 12 Z" fill={body} />
      {/* Windows read as cut out of the body, using the band's own background. */}
      <path d="M22 12 L26 5 H38 L42 12 Z" fill="var(--color-surface)" />
      <line x1="32" y1="5" x2="32" y2="12" stroke={body} strokeWidth="1.4" />
      <rect x="4" y="17" width="56" height="4" fill="var(--color-text)" opacity="0.15" />

      <Wheel cx={16} fill={wheel} />
      <Wheel cx={48} fill={wheel} />
    </svg>
  );
}

/** Five spokes, matching the brand mark's rim. */
function Wheel({ cx, fill }: { cx: number; fill: string }) {
  const spokes: Array<[number, number]> = [
    [cx, 17.6],
    [cx + 4.2, 19.7],
    [cx + 2.6, 26.3],
    [cx - 2.6, 26.3],
    [cx - 4.2, 19.7],
  ];

  return (
    <g
      style={{
        transformOrigin: `${cx}px 22px`,
        animation: "wheel-spin 0.6s linear infinite",
      }}
    >
      <circle cx={cx} cy="22" r="5" fill={fill} />
      {spokes.map(([x, y]) => (
        <line
          key={`${x}-${y}`}
          x1={cx}
          y1="22"
          x2={x}
          y2={y}
          stroke="var(--color-surface)"
          strokeWidth="1"
        />
      ))}
      <circle cx={cx} cy="22" r="1.5" fill="var(--color-surface)" />
    </g>
  );
}
