import Link from "next/link";

import { SiteFooter, SiteHeader } from "../../components/layout/site-chrome";

export const metadata = { title: "Negotiate — AutoScout" };

/**
 * The script is per-listing — it is built from that car's comps, mileage, and
 * generation — so there is nothing to show without one. Rather than inventing a
 * demo car, this points at where prep actually starts.
 */
export default function NegotiateIndex() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="text-[32px]">Negotiate</h1>
        <p className="mt-3 text-[16px] text-text-secondary">
          Prep is built per car. Shortlist one from the catalogue, then open it from your
          dashboard — you get what similar ones are asking, what is known to go wrong on that
          generation, and the questions to ask before you drive out.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="inline-flex min-h-9 items-center border border-transparent bg-accent px-4 text-[14px] font-extrabold text-bg transition-colors duration-150 ease-out hover:bg-accent-600"
          >
            Go to dashboard
          </Link>
          <Link
            href="/catalogue"
            className="inline-flex min-h-9 items-center border border-divider px-4 text-[14px] font-extrabold transition-colors duration-150 ease-out hover:bg-text/7"
          >
            Browse listings
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
