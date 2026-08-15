"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cx } from "../ui/primitives";
import { SiteHeader } from "./site-chrome";

// Same order and the same labels as the header nav. Two navigations that
// disagree about what a destination is called is a small thing that makes an
// app feel unfinished.
const SIDEBAR = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/catalogue", label: "Catalogue" },
  { href: "/settings", label: "Settings" },
];

/**
 * Shell for authenticated routes. The sidebar collapses to a horizontal,
 * scrollable strip on small screens rather than hiding behind another menu —
 * three destinations do not justify a second layer of navigation.
 */
export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8">
        <nav aria-label="Workspace" className="lg:w-52 lg:shrink-0">
          <ul className="scroll-x flex gap-1 lg:flex-col">
            {SIDEBAR.map((item) => {
              const active = pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "block px-3 py-2 text-[14px] transition-colors duration-150 ease-out lg:w-full",
                      active
                        ? "bg-surface text-text"
                        : "text-text-secondary hover:bg-text/7 hover:text-text",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider pb-5">
            <div>
              <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
              {description ? (
                <p className="mt-1.5 max-w-2xl text-[15px] text-text-secondary">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex gap-2">{actions}</div> : null}
          </div>

          <div className="pt-6">{children}</div>
        </main>
      </div>
    </>
  );
}
