/**
 * The AutoScout mark: a red square with a white five-spoke wheel rim.
 *
 * Copied vertex-for-vertex from AutoScout's DC pages. The design notes are
 * explicit that this went through several iterations before landing here —
 * deliberately not a magnifying glass, not a checkmark, not stripes — and that
 * it should be reused rather than redrawn.
 */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <rect width="18" height="18" fill="var(--color-accent)" />
      <circle cx="9" cy="9" r="6" fill="none" stroke="#ffffff" strokeWidth="1.4" />
      <line x1="9" y1="9" x2="9" y2="3" stroke="#ffffff" strokeWidth="1.3" />
      <line x1="9" y1="9" x2="14.71" y2="7.15" stroke="#ffffff" strokeWidth="1.3" />
      <line x1="9" y1="9" x2="12.53" y2="13.85" stroke="#ffffff" strokeWidth="1.3" />
      <line x1="9" y1="9" x2="5.47" y2="13.85" stroke="#ffffff" strokeWidth="1.3" />
      <line x1="9" y1="9" x2="3.29" y2="7.15" stroke="#ffffff" strokeWidth="1.3" />
      <circle cx="9" cy="9" r="1.4" fill="#ffffff" />
    </svg>
  );
}
