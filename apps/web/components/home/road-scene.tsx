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
      {/*
       * Hills, as two tiling patterns rather than three stretched triangles.
       *
       * No viewBox, so one user unit is one CSS pixel and nothing scales: a
       * wider window gets more hills instead of wider ones. The two layers have
       * different tile widths (190 and 280), so their peaks drift out of phase
       * and the ridge line does not visibly repeat until 1330px — past the
       * content column. The far layer is lighter, which is the only depth cue a
       * flat silhouette gets.
       */}
      <svg width="100%" height="56" className="absolute left-0 top-0 h-14 w-full">
        <defs>
          <pattern id="road-hills-far" width="190" height="56" patternUnits="userSpaceOnUse">
            <polygon points="0,56 30,34 60,56" fill="var(--color-neutral-200)" />
            <polygon points="48,56 92,26 136,56" fill="var(--color-neutral-200)" />
            <polygon points="120,56 158,36 190,56" fill="var(--color-neutral-200)" />
          </pattern>
          <pattern id="road-hills-near" width="280" height="56" patternUnits="userSpaceOnUse">
            <polygon points="10,56 52,22 94,56" fill="var(--color-neutral-300)" />
            <polygon points="60,56 116,12 172,56" fill="var(--color-neutral-300)" />
            <polygon points="150,56 190,30 230,56" fill="var(--color-neutral-300)" />
            <polygon points="212,56 246,28 280,56" fill="var(--color-neutral-300)" />
          </pattern>
        </defs>
        <rect width="100%" height="56" fill="url(#road-hills-far)" />
        <rect width="100%" height="56" fill="url(#road-hills-near)" />
      </svg>

      {/* Trees sit outside that SVG, at fixed pixel size and placed by percent.
          Inside it they inherited the horizontal stretch — roughly 3.5x at a
          desktop width — and a conifer that wide stops looking like one. The
          percentages are the mockup's x-coordinates over its 400-unit width. */}
      <Tree kind="tall" left="35.75%" />
      <Tree kind="tall" left="55.75%" />
      <Tree kind="short" left="4.25%" />
      <Tree kind="short" left="89.25%" />

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
 * A conifer, bottom-aligned to the horizon where the road starts.
 *
 * Same vertices as the mockup, re-origined to a tight viewBox: the tall tree is
 * 12x32 with two tiers, the short one 10x24 with one. `bottom-4` puts the trunk
 * base on the road's top edge, since the road is the band's bottom 16px.
 */
function Tree({ kind, left }: { kind: "tall" | "short"; left: string }) {
  const tall = kind === "tall";
  const fill = "var(--color-neutral-400)";

  return (
    <svg
      width={tall ? 12 : 10}
      height={tall ? 32 : 24}
      viewBox={tall ? "0 0 12 32" : "0 0 10 24"}
      className="absolute bottom-4"
      style={{ left }}
    >
      {tall ? (
        <>
          <rect x="5" y="18" width="2" height="14" fill={fill} />
          <polygon points="6,0 0,20 12,20" fill={fill} />
          <polygon points="6,8 1,24 11,24" fill={fill} />
        </>
      ) : (
        <>
          <rect x="4" y="14" width="2" height="10" fill={fill} />
          <polygon points="5,0 0,16 10,16" fill={fill} />
        </>
      )}
    </svg>
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
