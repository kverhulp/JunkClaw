"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { motion } from "motion/react";

import { Badge, Button, cx } from "../ui/primitives";
import { BrandMark } from "./brand";
import { LegalDialogs, type LegalDoc } from "../legal/legal-dialogs";

const NAV = [
  { href: "/catalogue", label: "Catalogue" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

/** Placeholder for real session state; better-auth lands in apps/web/lib/auth.ts. */
const SIGNED_IN = false;

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");

  /**
   * Search lives in the header on every page, and it goes somewhere: submitting
   * navigates to the catalogue with the term applied, which is the only place
   * results can actually be shown. A search box that does nothing on the pages
   * where it appears is worse than no search box.
   */
  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    router.push(term ? `/catalogue?q=${encodeURIComponent(term)}` : "/catalogue");
  }

  return (
    <header className="sticky top-0 z-40 border-b-2 border-divider bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-[18px] font-extrabold"
        >
          <BrandMark />
          AutoScout
        </Link>

        <form role="search" className="hidden min-w-0 flex-1 md:block" onSubmit={onSearch}>
          <label htmlFor="global-search" className="sr-only">
            Search listings
          </label>
          <input
            id="global-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search make, model, or year…"
            className={cx(
              "min-h-9 w-full max-w-md border border-divider bg-surface px-2.5 py-1.5",
              "text-[14px] caret-accent placeholder:text-text-muted",
              "transition-[border-color] duration-150 ease-out",
              "hover:border-text/45",
            )}
          />
        </form>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative px-3 py-1.5 text-[14px] transition-colors duration-150 ease-out",
                  active ? "text-text" : "text-text-secondary hover:text-text",
                )}
              >
                {/* Shared layoutId: the indicator travels between items instead
                    of cutting, which is the whole effect. */}
                {active ? (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute inset-0 -z-10 bg-surface"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                ) : null}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {SIGNED_IN ? (
            <Button size="sm" variant="secondary">
              Account
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost">
                Sign in
              </Button>
              <Button size="sm" variant="primary">
                Get started
              </Button>
            </>
          )}
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="md:hidden"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? "Close" : "Menu"}
        </Button>
      </div>

      {mobileOpen ? (
        <div id="mobile-nav" className="border-t border-divider bg-surface md:hidden">
          <nav aria-label="Main" className="mx-auto flex max-w-7xl flex-col p-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 text-[14px] text-text-secondary hover:bg-text/7 hover:text-text"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2 border-t border-divider p-2 pt-3">
              <Button size="sm" variant="secondary" className="flex-1">
                Sign in
              </Button>
              <Button size="sm" variant="primary" className="flex-1">
                Get started
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  // Dialogs rather than routes: these are short documents, and sending someone
  // to a separate page loses the position they were reading from.
  const [legal, setLegal] = useState<LegalDoc>(null);

  return (
    <footer className="mt-16 border-t-2 border-divider">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div>
          <p className="text-[20px] font-extrabold">AutoScout</p>
          <p className="mt-1.5 text-[13px] text-text-secondary">Founded 2026</p>
        </div>

        <FooterColumn
          title="Quick links"
          links={[
            { href: "/catalogue", label: "Listings" },
            { href: "/dashboard", label: "Dashboard" },
            { href: "/settings", label: "Settings" },
          ]}
        />
        <div>
          <p className="micro text-text-muted">Legal</p>
          <ul className="mt-3 flex flex-col items-start gap-2 text-[14px]">
            <li>
              <button
                type="button"
                onClick={() => setLegal("privacy")}
                className="cursor-pointer text-text-secondary hover:text-text"
              >
                Privacy policy
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setLegal("terms")}
                className="cursor-pointer text-text-secondary hover:text-text"
              >
                Terms of service
              </button>
            </li>
          </ul>
        </div>

        <div>
          <p className="micro text-text-muted">System status</p>
          <ul className="mt-3 flex flex-col gap-2 text-[14px]">
            <li className="flex items-center justify-between gap-2">
              <span className="text-text-secondary">Facebook Marketplace</span>
              <Badge tone="positive">Collecting</Badge>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t-2 border-divider">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-[13px] text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 AutoScout. Prices shown are seller asking prices, not sale prices.</p>
          <p>Information only — not financial or purchasing advice.</p>
        </div>
      </div>

      <LegalDialogs open={legal} onClose={() => setLegal(null)} />
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div>
      <p className="micro text-text-muted">{title}</p>
      <ul className="mt-3 flex flex-col gap-2 text-[14px]">
        {/* Keyed on label, not href: the Legal column has two placeholder links
            that both point at "#", which collides when href is the key. */}
        {links.map((link) => (
          <li key={link.label}>
            <Link href={link.href} className="text-text-secondary hover:text-text">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
