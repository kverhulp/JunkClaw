import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/**
 * Modernist primitives, ported from AutoScout's `_ds` bundle.
 *
 * The system's rules, which every component here follows: zero border-radius,
 * 2px hairline rules instead of shadows and card edges, Archivo at weight 800
 * for anything heading-shaped, and a single red accent used sparingly.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Accent fill with the page background as the label colour — Modernist's
  // .btn-primary, which reverses out rather than using white.
  primary: "bg-accent text-bg border-transparent hover:bg-accent-600",
  secondary: "border-divider hover:bg-text/7 active:bg-text/14",
  ghost: "border-transparent text-accent-700 hover:bg-accent/10",
  danger: "border-divider text-accent-700 hover:bg-accent/10",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-[13px]",
  md: "min-h-9 px-3.5 text-[14px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 border font-extrabold leading-tight",
        "transition-[background-color,border-color,opacity] duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-45",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------- Card */

/**
 * A flat surface panel. Modernist has no elevated card — depth comes from the
 * surface value and the rules around it, never from a shadow.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("bg-surface", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("border-b-2 border-divider px-4 py-3", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("px-4 py-3", className)} {...props} />;
}

/** The system's structural device. Use in place of a card edge. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cx("my-4 h-0.5 border-0 bg-divider", className)} />;
}

/* ------------------------------------------------------------------- Input */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, id, className, ...props }: InputProps) {
  const inputId = id ?? props.name;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col">
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-[12px] text-text-secondary">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cx(
          "min-h-9 w-full border bg-surface px-2.5 py-1.5 text-[14px] text-text caret-accent",
          "placeholder:text-text-muted",
          "transition-[border-color] duration-150 ease-out",
          error ? "border-accent" : "border-divider hover:border-text/45",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-[13px] text-accent-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-[13px] text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */

type BadgeTone = "neutral" | "accent" | "positive" | "warning" | "critical";

/** Modernist's .tag. Outline for emphasis, tinted fill for everything else. */
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 text-text/80",
  accent: "border border-accent text-accent-700",
  positive: "bg-accent-100 text-accent-800",
  warning: "bg-neutral-300 text-text/80",
  critical: "border border-accent text-accent-700",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cx(
        "inline-flex items-center px-2.5 py-0.5 text-[11px] tracking-[0.02em]",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cx("skeleton-pulse bg-neutral-300", className)} {...props} />;
}

/* ------------------------------------------------------------------- Table */

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scroll-x">
      <table className={cx("w-full border-collapse text-[14px]", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cx(
        "border-b-2 border-divider px-2 py-2 text-left text-[11px] uppercase tracking-[0.08em] text-text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx("border-b border-divider px-2 py-2 align-middle", className)} {...props} />
  );
}

/* --------------------------------------------------------------- Sections */

/**
 * Empty and error states are components rather than ad-hoc JSX so every data
 * view is forced to have one. "Not enough data" is a real answer here and must
 * look deliberate, not like a panel that failed to render.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 border-2 border-dashed border-divider px-6 py-12">
      <p className="text-[16px] font-extrabold">{title}</p>
      <p className="max-w-md text-[14px] text-text-secondary">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  retry,
}: {
  title: string;
  body: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 border-2 border-accent px-6 py-12">
      <p className="text-[16px] font-extrabold">{title}</p>
      <p className="max-w-md text-[14px] text-text-secondary">{body}</p>
      {retry ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={retry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
