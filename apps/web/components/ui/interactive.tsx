"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button, cx } from "./primitives";
import { motion, OVERLAY_MOTION } from "./motion";

/**
 * Interactive primitives. Every overlay here traps focus, restores it on close,
 * and closes on Escape — a drawer you cannot leave with the keyboard is a
 * drawer that locks out anyone not using a mouse.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useFocusTrap(active: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !node) return;

      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [active, onClose]);

  return ref;
}

/* ------------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const trapRef = useFocusTrap(open, onClose);
  const titleId = useId();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/50"
        onClick={onClose}
        aria-hidden
      />
      {/* Modernist's .dialog: flat surface, square corners, one shadow. The
          system specifies min(440px, 100%); this is wider because a legal
          document at 440px is a column of about 45 characters, which is
          punishing to read. Every other value is the system's. */}
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85vh] w-full max-w-[560px] flex-col bg-surface shadow-lg"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b-2 border-divider px-4 py-3">
          <h2 id={titleId} className="text-[20px] font-extrabold">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
            Close
          </Button>
        </div>
        {/* Scrolls internally so the dialog never grows past the viewport. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[14px]">{children}</div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t-2 border-divider px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Drawer */

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const trapRef = useFocusTrap(open, onClose);
  const titleId = useId();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <motion.div
        {...OVERLAY_MOTION.backdrop}
        className="absolute inset-0 bg-neutral-900/50"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={trapRef}
        {...OVERLAY_MOTION.panelRight}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col",
          "border-l border-divider bg-surface shadow-lg",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-divider px-5 py-3.5">
          <h2 id={titleId} className="text-[18px] font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-divider px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------- Tabs */

export interface TabItem {
  id: string;
  label: string;
  badge?: string;
}

/**
 * Roving tabindex with arrow-key navigation, per the WAI-ARIA tabs pattern:
 * only the active tab is in the tab order, and arrows move between them.
 */
export function Tabs({
  items,
  activeId,
  onSelect,
  ariaLabel,
}: {
  items: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const last = items.length - 1;
      let next: number | null = null;

      if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
      else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;

      if (next === null) return;
      event.preventDefault();
      const item = items[next];
      if (item) {
        onSelect(item.id);
        refs.current[next]?.focus();
      }
    },
    [items, onSelect],
  );

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-divider">
      {items.map((item, index) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={active}
            aria-controls={`panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[14px] font-medium",
              "transition-[color,border-color] duration-150 ease-out",
              active
                ? "border-accent text-text"
                : "border-transparent text-text-secondary hover:text-text",
            )}
          >
            {item.label}
            {item.badge ? (
              <span className="tabular bg-neutral-300 px-1.5 py-0.5 text-[11px] text-text-secondary">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Dropdown */

export interface DropdownOption {
  value: string;
  label: string;
}

export function Dropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <span id={buttonId} className="sr-only">
        {label}
      </span>
      <Button
        variant="secondary"
        size="sm"
        aria-labelledby={buttonId}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="w-full justify-between"
      >
        <span className="truncate">{selected?.label ?? label}</span>
        <span aria-hidden className="text-text-muted">
          ▾
        </span>
      </Button>

      {open ? (
        <ul
          role="listbox"
          aria-labelledby={buttonId}
          className="absolute z-20 mt-1 w-full overflow-hidden border border-divider bg-neutral-300 shadow-lg"
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cx(
                  "w-full px-3 py-2 text-left text-[14px] transition-colors duration-150 ease-out",
                  option.value === value
                    ? "bg-accent-100 text-text"
                    : "text-text-secondary hover:bg-text/7 hover:text-text",
                )}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
