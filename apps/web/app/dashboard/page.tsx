"use client";

import { useState } from "react";

import { AppShell } from "../../components/layout/app-shell";
import { CarSuperDataDrawer } from "../../components/catalogue/super-data-drawer";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  Td,
  Th,
} from "../../components/ui/primitives";
import { Crossfade } from "../../components/ui/motion";
import { ShortlistSection } from "../../components/dashboard/shortlist-section";
import { useDashboard } from "../../lib/data";
import { money, signedMoney, titleCase } from "../../lib/format";
import { supplierLabel, type CatalogueListing } from "../../mocks/vehicles";

export default function DashboardPage() {
  const { data, isLoading, isError, isEmpty, refetch } = useDashboard();
  const [selected, setSelected] = useState<CatalogueListing | null>(null);

  return (
    <AppShell
      title="Overview"
      description="Saved searches, price movement, and what you looked at recently."
      actions={<Button variant="primary" size="sm">New saved search</Button>}
    >
      <ShortlistSection />

      <Crossfade state={isLoading ? "loading" : isError ? "error" : isEmpty ? "empty" : "ready"}>
      {isLoading ? (
        <DashboardSkeleton />
      ) : isError ? (
        <ErrorState
          title="Couldn't load your workspace"
          body="Your saved searches are safe — this is a display problem, not a data one."
          retry={refetch}
        />
      ) : isEmpty || !data ? (
        <EmptyState
          title="Nothing saved yet"
          body="Save a search from the catalogue and price drops will show up here."
          action={<Button variant="primary" size="sm">Browse the catalogue</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="saved-searches">
            <h2 id="saved-searches" className="text-[17px] font-medium">
              Saved searches
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {data.savedSearches.map((search) => (
                <Card key={search.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[15px] font-medium">{search.name}</p>
                    {search.newSinceLastVisit > 0 ? (
                      <Badge tone="accent">{search.newSinceLastVisit} new</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[13px] text-text-secondary">{search.supplier}</p>
                </Card>
              ))}
            </div>
          </section>

          <section aria-labelledby="price-drops">
            <h2 id="price-drops" className="text-[17px] font-medium">
              Price drops
            </h2>
            <p className="mt-1 text-[14px] text-text-secondary">
              A seller who has already dropped the price has told you they will move again.
            </p>

            <Card className="mt-3 overflow-hidden">
              <Table>
                <thead>
                  <tr>
                    <Th>Vehicle</Th>
                    <Th className="text-right">Was</Th>
                    <Th className="text-right">Now</Th>
                    <Th className="text-right">Change</Th>
                    <Th>Supplier</Th>
                    <Th className="text-right">Listed</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.priceDrops.map((listing) => {
                    const change = listing.priceCents - (listing.previousPriceCents ?? 0);
                    return (
                      <tr
                        key={listing.id}
                        onClick={() => setSelected(listing)}
                        className="cursor-pointer transition-colors duration-150 ease-out hover:bg-text/7"
                      >
                        <Td>
                          <button
                            type="button"
                            className="text-left font-medium"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(listing);
                            }}
                          >
                            {listing.vehicle.year} {titleCase(listing.vehicle.make)}{" "}
                            {titleCase(listing.vehicle.model)}
                          </button>
                        </Td>
                        <Td className="tabular text-right text-text-muted line-through">
                          {money(listing.previousPriceCents ?? 0)}
                        </Td>
                        <Td className="tabular text-right font-medium">{money(listing.priceCents)}</Td>
                        <Td className="tabular text-right text-accent-700">{signedMoney(change)}</Td>
                        <Td className="text-text-secondary">{supplierLabel(listing.source)}</Td>
                        <Td className="tabular text-right text-text-secondary">
                          {listing.analysis ? `${listing.analysis.daysOnMarket}d` : "—"}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          </section>

          <section aria-labelledby="recent">
            <h2 id="recent" className="text-[17px] font-medium">
              Recently viewed
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.recentlyViewed.map((listing) => (
                <Card key={listing.id}>
                  <CardHeader className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium">
                      {listing.vehicle.year} {titleCase(listing.vehicle.model)}
                    </span>
                    <span className="tabular shrink-0 text-[14px]">{money(listing.priceCents)}</span>
                  </CardHeader>
                  <CardBody>
                    <button
                      type="button"
                      onClick={() => setSelected(listing)}
                      className="text-[13px] text-accent hover:underline"
                    >
                      Open details
                    </button>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
      </Crossfade>

      <CarSuperDataDrawer listing={selected} onClose={() => setSelected(null)} />
    </AppShell>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-56" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    </div>
  );
}
