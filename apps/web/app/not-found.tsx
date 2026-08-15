import Link from "next/link";

import { SiteFooter, SiteHeader } from "../components/layout/site-chrome";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-2xl flex-col items-start px-4 py-24 sm:px-6">
        <p className="micro text-text-muted">404</p>
        <h1 className="mt-3 text-[32px] font-semibold tracking-tight">This page isn&rsquo;t here</h1>
        <p className="mt-3 text-[16px] text-text-secondary">
          The link may be stale, or the listing may no longer be collected. Everything we hold is
          in the catalogue.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            href="/catalogue"
            className="inline-flex h-9 items-center border border-transparent bg-accent px-4 text-[14px] font-medium transition-colors duration-150 ease-out hover:bg-accent-600"
          >
            Open the catalogue
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center border border-divider bg-surface px-4 text-[14px] font-medium transition-colors duration-150 ease-out hover:bg-text/7"
          >
            Back to home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
