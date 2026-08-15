"use client";

import { useState } from "react";

import { AppShell } from "../../components/layout/app-shell";
import { CarSuperDataDrawer } from "../../components/catalogue/super-data-drawer";
import {
  Button,
  Card,
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
      title="Dashboard"
      description="Your shortlist and price movement on the cars you are tracking."
    >
      {/* gap-10 rather than the gap-6 used between sections inside the loaded
          block: the shortlist is its own thing, and the same spacing on both
          sides would read as one long list. */}
      <div className="flex flex-col gap-10">
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
          body="Shortlist a car from the catalogue and price drops will show up here."
          action={<Button variant="primary" size="sm">Browse the catalogue</Button>}
        />
      ) : (
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
      )}
      </Crossfade>
      </div>

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
    </div>
  );
}
