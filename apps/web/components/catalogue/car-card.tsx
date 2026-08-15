"use client";

import { Badge, Card, cx, Skeleton } from "../ui/primitives";
import { Reveal, SpotlightCard } from "../ui/motion";
import { PricePosition } from "./price-position";
import { daysListed, kilometres, money, signedMoney, titleCase } from "../../lib/format";
import { supplierLabel, type CatalogueListing } from "../../mocks/vehicles";

/**
 * The card carries the four figures someone actually scans on: price, the delta
 * against comparable asking prices, mileage, and how long it has been listed.
 *
 * Deliberately no score. The dollar delta is defensible; a "/100" is invented
 * precision, and days-on-market is the strongest negotiation signal we hold.
 */
export function CarCard({
  listing,
  onSelect,
}: {
  listing: CatalogueListing;
  onSelect: (listing: CatalogueListing) => void;
}) {
  const { vehicle, analysis } = listing;
  const delta = analysis?.priceDeltaCents ?? null;
  const belowMarket = delta !== null && delta < 0;

  return (
    <SpotlightCard>
    <Card className="group overflow-hidden hover:border-text/45">
      <button
        type="button"
        onClick={() => onSelect(listing)}
        className="w-full text-left"
        aria-label={`${listing.rawTitle}, ${money(listing.priceCents)}. Open details.`}
      >
        <div className="relative aspect-[3/2] overflow-hidden border-b border-divider bg-bg">
          <img
            src={listing.photoUrls[0]}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
          />
          <div className="absolute left-2 top-2 flex gap-1.5">
            <Badge tone="neutral" className="bg-bg/85 backdrop-blur">
              {supplierLabel(listing.source)}
            </Badge>
            {listing.isDealer ? (
              <Badge tone="neutral" className="bg-bg/85 backdrop-blur">
                Dealer
              </Badge>
            ) : null}
          </div>
          {listing.previousPriceCents !== null ? (
            <div className="absolute right-2 top-2">
              <Badge tone="warning" className="bg-bg/85 backdrop-blur">
                Price drop
              </Badge>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate text-[15px] font-medium">
              {vehicle.year} {titleCase(vehicle.make)} {titleCase(vehicle.model)}
            </h3>
            <span className="tabular shrink-0 text-[15px] font-semibold">
              {money(listing.priceCents)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[13px] text-text-secondary">
            <span className="tabular">{kilometres(vehicle.mileageKm)}</span>
            <span aria-hidden className="text-text-muted">
              ·
            </span>
            <span className="truncate">
              {listing.location.city}, {listing.location.region}
            </span>
          </div>

          {analysis ? (
            <div className="pt-0.5">
              <PricePosition priceCents={listing.priceCents} analysis={analysis} />
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-divider pt-2">
            {delta === null ? (
              <span className="text-[13px] text-text-muted">Not enough data to price</span>
            ) : (
              <span
                className={cx(
                  "tabular text-[13px] font-medium",
                  belowMarket ? "text-accent-700" : "text-text-secondary",
                )}
              >
                {signedMoney(delta)} {belowMarket ? "below" : "above"} similar asks
              </span>
            )}
            <span className="shrink-0 text-[13px] text-text-muted">
              {analysis ? `${analysis.daysOnMarket}d` : "—"}
            </span>
          </div>
        </div>
      </button>
    </Card>
    </SpotlightCard>
  );
}

export function CarCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-[3/2]" />
      <div className="flex flex-col gap-2.5 p-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-3.5 w-32" />
        <div className="border-t border-divider pt-2">
          <Skeleton className="h-3.5 w-44" />
        </div>
      </div>
    </Card>
  );
}

export function CarCardGrid({
  listings,
  onSelect,
}: {
  listings: CatalogueListing[];
  onSelect: (listing: CatalogueListing) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing, index) => (
        // Stagger caps at the first row: past that it reads as lag, not sequence.
        <Reveal key={listing.id} delay={Math.min(index, 3) * 0.05}>
          <CarCard listing={listing} onSelect={onSelect} />
        </Reveal>
      ))}
    </div>
  );
}

export function CarCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <CarCardSkeleton key={index} />
      ))}
    </div>
  );
}

export { daysListed };
