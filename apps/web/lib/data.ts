"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Source } from "@junkclaw/schema";

import { listingsBySupplier, MOCK_LISTINGS, type CatalogueListing } from "../mocks/vehicles";

/**
 * The seam Kody's API lands on.
 *
 * Components never touch the mocks directly — they call these hooks, which is
 * the whole point of the indirection: replacing the body of `fetchListings`
 * with a real `fetch` changes nothing above it. The query-state shape
 * (`isLoading` / `isError` / `isEmpty`) matches what TanStack Query exposes, so
 * swapping this for the real thing later is mechanical.
 */

export interface QueryState<T> {
  data: T | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /** Distinct from `!data` — a successful response with zero rows is not a failure. */
  isEmpty: boolean;
  refetch: () => void;
}

/** Stand-in for network latency, so skeletons are exercised in development. */
const MOCK_LATENCY_MS = 450;

function useMockQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  isEmptyFn: (data: T) => boolean,
): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [...deps, nonce]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  return {
    data,
    isLoading,
    isError: error !== null,
    error,
    isEmpty: data !== null && isEmptyFn(data),
    refetch,
  };
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
}

/* ---------------------------------------------------------------- Filters */

export interface ListingFilters {
  query: string;
  priceMaxCents: number | null;
  yearMin: number | null;
  mileageMaxKm: number | null;
  transmission: string | null;
  fuel: string | null;
  city: string | null;
}

export const EMPTY_FILTERS: ListingFilters = {
  query: "",
  priceMaxCents: null,
  yearMin: null,
  mileageMaxKm: null,
  transmission: null,
  fuel: null,
  city: null,
};

export function applyFilters(
  listings: CatalogueListing[],
  filters: ListingFilters,
): CatalogueListing[] {
  const needle = filters.query.trim().toLowerCase();

  return listings.filter((listing) => {
    if (needle && !listing.rawTitle.toLowerCase().includes(needle)) return false;
    if (filters.priceMaxCents !== null && listing.priceCents > filters.priceMaxCents) return false;
    if (filters.yearMin !== null && listing.vehicle.year < filters.yearMin) return false;
    if (
      filters.mileageMaxKm !== null &&
      listing.vehicle.mileageKm !== null &&
      listing.vehicle.mileageKm > filters.mileageMaxKm
    ) {
      return false;
    }
    if (filters.transmission && listing.vehicle.transmission !== filters.transmission) return false;
    if (filters.fuel && listing.vehicle.fuel !== filters.fuel) return false;
    if (filters.city && listing.location.city !== filters.city) return false;
    return true;
  });
}

/* ------------------------------------------------------------------ Hooks */

/** TODO(integration): GET /api/listings?source=… */
export function useSupplierListings(source: Source, filters: ListingFilters) {
  const query = useMockQuery<CatalogueListing[]>(
    () => delay(listingsBySupplier(source)),
    [source],
    (rows) => rows.length === 0,
  );

  const filtered = useMemo(
    () => (query.data === null ? null : applyFilters(query.data, filters)),
    [query.data, filters],
  );

  return {
    ...query,
    data: filtered,
    // Filtering to nothing is also empty — the view needs to say so, and to say
    // something different from "this supplier has no listings at all".
    isEmpty: filtered !== null && filtered.length === 0,
    isFiltered: filtered !== null && query.data !== null && filtered.length !== query.data.length,
    totalBeforeFilters: query.data?.length ?? 0,
  };
}

/** TODO(integration): GET /api/listings/recent */
export function useFeaturedListings(limit = 6) {
  return useMockQuery<CatalogueListing[]>(
    () =>
      delay(
        [...MOCK_LISTINGS]
          .sort((a, b) => {
            const aDelta = a.analysis?.priceDeltaCents ?? 0;
            const bDelta = b.analysis?.priceDeltaCents ?? 0;
            return aDelta - bDelta;
          })
          .slice(0, limit),
      ),
    [limit],
    (rows) => rows.length === 0,
  );
}

/** TODO(integration): GET /api/dashboard */
export function useDashboard() {
  return useMockQuery(
    () =>
      delay({
        priceDrops: MOCK_LISTINGS.filter((listing) => listing.previousPriceCents !== null),
        recentlyViewed: MOCK_LISTINGS.slice(0, 4),
      }),
    [],
    (data) => data.priceDrops.length === 0 && data.recentlyViewed.length === 0,
  );
}
