"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { motion } from "motion/react";

import { Badge, Button, cx } from "../ui/primitives";
import { BrandMark } from "./brand";
import { useSession } from "../../lib/session";
import { LegalDialogs, type LegalDoc } from "../legal/legal-dialogs";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/negotiate", label: "Negotiate" },
  { href: "/settings", label: "Settings" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user, ready, signOut } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b-2 border-divider bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 text-[18px] font-extrabold"
        >
          <BrandMark />
          AutoScout
        </Link>

        {/* No search here. The catalogue's own filter sidebar is the search, and
            a second box in the header would be a duplicate control that has to
            stay in sync with it. */}
        <div className="flex-1" />

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

        <div className="hidden shrink-0 items-center gap-3 md:flex">
          {/* Renders nothing until the session is read, rather than flashing
              "Sign in" at someone who is already signed in. */}
          {!ready ? null : user ? (
            <>
              <span className="text-[14px] text-text-secondary">{user.name}</span>
              <Button size="sm" variant="secondary" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="px-1 text-[14px] font-extrabold text-accent-700 hover:underline"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex min-h-8 items-center border border-transparent bg-accent px-3 text-[14px] font-extrabold text-bg transition-colors duration-150 ease-out hover:bg-accent-600"
              >
                Get started
              </Link>
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
              {user ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    signOut();
                    setMobileOpen(false);
                  }}
                >
                  Sign out
                </Button>
              ) : (
                <>
                  <Link
                    href="/sign-in"
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex min-h-8 flex-1 items-center justify-center border border-divider px-3 text-[14px] font-extrabold"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex min-h-8 flex-1 items-center justify-center border border-transparent bg-accent px-3 text-[14px] font-extrabold text-bg"
                  >
                    Get started
                  </Link>
                </>
              )}
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
