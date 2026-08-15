import type { ReactNode } from "react";

import { SiteFooter, SiteHeader } from "./site-chrome";

/**
 * Shell for the workspace pages.
 *
 * No sidebar. It held Dashboard and Settings, which the header already lists on
 * every page — a second navigation that repeats the first is furniture, and it
 * pushed the content it framed into a narrower column for nothing.
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
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-divider pb-5">
          <div>
            <h1 className="text-[32px]">{title}</h1>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-[15px] text-text-secondary">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex gap-2">{actions}</div> : null}
        </div>

        <div className="pt-6">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
