"use client";

import Link from "next/link";

import { Badge, Card, EmptyState, Skeleton } from "../ui/primitives";
import { money, signedMoney, titleCase } from "../../lib/format";
import { useShortlist } from "../../lib/shortlist";
import { listingById } from "../../mocks/vehicles";

/**
 * The cars pulled out of the catalogue to act on.
 *
 * This is the hinge of the flow: the catalogue is for browsing, the dashboard
 * is the shortlist, and negotiation opens from here — one car at a time, on a
 * screen that shows the spending ceiling.
 */
export function ShortlistSection() {
  const { ids, ready, remove } = useShortlist();
  const listings = ids.map(listingById).filter((listing) => listing !== undefined);

  return (
    <section aria-labelledby="shortlist">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="shortlist" className="text-[20px]">
          Shortlist
        </h2>
        {ready && listings.length > 0 ? (
          <span className="tabular text-[13px] text-text-secondary">
            {listings.length} {listings.length === 1 ? "car" : "cars"}
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        {/* Waits for localStorage rather than flashing the empty state on every
            load — a shortlist that appears to vanish on refresh reads as data loss. */}
        {!ready ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            title="Nothing shortlisted yet"
            body="Open a listing in the catalogue and choose Add to dashboard. Shortlisted cars are where negotiations start."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => {
              const delta = listing.analysis?.priceDeltaCents ?? null;
              return (
                <li key={listing.id}>
                  <Card className="flex h-full flex-col gap-2 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="m-0 text-[15px] font-extrabold">
                        {listing.vehicle.year} {titleCase(listing.vehicle.model)}
                      </p>
                      <span className="tabular shrink-0 text-[15px]">
                        {money(listing.priceCents)}
                      </span>
                    </div>

                    <p className="m-0 text-[13px] text-text-secondary">
                      {listing.location.city}, {listing.location.region}
                    </p>

                    {delta === null ? (
                      <Badge tone="neutral" className="self-start">
                        Not enough data
                      </Badge>
                    ) : (
                      <span className="tabular text-[13px] text-accent-700">
                        {signedMoney(delta)} vs. similar asks
                      </span>
                    )}

                    <div className="mt-auto flex items-center gap-3 pt-2">
                      <Link
                        href={`/negotiate/${listing.id}`}
                        className="inline-flex min-h-8 items-center border border-transparent bg-accent px-3 text-[13px] font-extrabold text-bg transition-colors duration-150 ease-out hover:bg-accent-600"
                      >
                        Negotiate
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(listing.id)}
                        className="cursor-pointer text-[13px] text-text-secondary hover:text-text"
                      >
                        Remove
                      </button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
