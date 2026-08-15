"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button, EmptyState, ErrorState } from "../ui/primitives";
import { Crossfade } from "../ui/motion";
import { CarCardGrid, CarCardGridSkeleton } from "./car-card";
import { CarSuperDataDrawer } from "./super-data-drawer";
import { FilterSidebar } from "./filter-sidebar";
import { EMPTY_FILTERS, useSupplierListings, type ListingFilters } from "../../lib/data";
import { SUPPLIER, type CatalogueListing } from "../../mocks/vehicles";

/**
 * The catalogue.
 *
 * There are no supplier tabs: Facebook Marketplace is the only source, and a
 * tab bar with one tab is furniture that tells the user nothing. If a second
 * supplier is ever added, the tabs come back — until then the page says what is
 * true without decorating it.
 */
export function CatalogueView() {
  // Seeded from ?q= so the header's search actually lands somewhere. Read once
  // as the initial value rather than kept in sync: after arriving, the filter
  // sidebar owns the term, and re-syncing would fight the user's edits.
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ListingFilters>(() => ({
    ...EMPTY_FILTERS,
    query: searchParams.get("q") ?? "",
  }));
  const [selected, setSelected] = useState<CatalogueListing | null>(null);
  const [filtersOpenOnMobile, setFiltersOpenOnMobile] = useState(false);

  const { data, isLoading, isError, isEmpty, isFiltered, totalBeforeFilters, refetch } =
    useSupplierListings(SUPPLIER.source, filters);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-[32px]">Listings</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-text-secondary">
        Collected from {SUPPLIER.label} as you browse, and scored against similar asking prices
        nearby.
      </p>

      <hr className="my-6 h-0.5 border-0 bg-divider" />

      <div className="mb-6 flex items-center justify-between lg:hidden">
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={filtersOpenOnMobile}
          onClick={() => setFiltersOpenOnMobile((open) => !open)}
        >
          {filtersOpenOnMobile ? "Hide filters" : "Show filters"}
        </Button>
        <span className="text-[13px] text-text-secondary">
          <span className="tabular">{data?.length ?? 0}</span> shown
        </span>
      </div>

      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className={filtersOpenOnMobile ? "block" : "hidden lg:block"}>
          <FilterSidebar filters={filters} onChange={setFilters} resultCount={data?.length ?? 0} />
        </div>

        <section>
          <Crossfade
            state={isLoading ? "loading" : isError ? "error" : isEmpty ? "empty" : "ready"}
          >
            {isLoading ? (
              <CarCardGridSkeleton count={6} />
            ) : isError ? (
              <ErrorState
                title="Couldn't load listings"
                body="The catalogue service didn't respond. Your filters are unchanged."
                retry={refetch}
              />
            ) : isEmpty ? (
              // Two genuinely different empty states: nothing collected yet,
              // versus filters that excluded everything. Same blank grid,
              // different fix.
              isFiltered || totalBeforeFilters > 0 ? (
                <EmptyState
                  title="No listings match these filters"
                  body={`${totalBeforeFilters} ${
                    totalBeforeFilters === 1 ? "listing is" : "listings are"
                  } available. Widening the price or mileage range usually helps most.`}
                  action={
                    <Button variant="secondary" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="Nothing collected yet"
                  body="The catalogue fills as you browse Marketplace with the extension connected."
                />
              )
            ) : (
              <>
                <CarCardGrid listings={data ?? []} onSelect={setSelected} />
                <p className="mt-6 text-[13px] text-text-muted">
                  Showing {data?.length ?? 0} of {totalBeforeFilters}. Prices are seller asking
                  prices, not sale prices.
                </p>
              </>
            )}
          </Crossfade>
        </section>
      </div>

      <CarSuperDataDrawer listing={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
