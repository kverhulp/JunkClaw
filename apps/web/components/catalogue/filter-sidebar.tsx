"use client";

import { Button, cx } from "../ui/primitives";
import { EMPTY_FILTERS, type ListingFilters } from "../../lib/data";
import { money } from "../../lib/format";

/**
 * Range inputs rather than dual-handle sliders.
 *
 * A native range input is keyboard-operable, screen-reader-announced, and
 * touch-friendly for free. A custom two-handle slider is none of those without
 * substantial work, and the filter is a "max" in practice — nobody shopping
 * used cars sets a price floor.
 */

const PRICE_MAX = 5_000_000;
const MILEAGE_MAX = 350_000;

export function FilterSidebar({
  filters,
  onChange,
  resultCount,
}: {
  filters: ListingFilters;
  onChange: (filters: ListingFilters) => void;
  resultCount: number;
}) {
  const set = <K extends keyof ListingFilters>(key: K, value: ListingFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <aside aria-label="Filters" className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-medium">Filters</h2>
        {dirty ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
            Reset
          </Button>
        ) : null}
      </div>

      <Field label="Search">
        <input
          type="search"
          value={filters.query}
          onChange={(event) => set("query", event.target.value)}
          placeholder="Make or model"
          className="h-9 w-full border border-divider bg-bg px-3 text-[14px] placeholder:text-text-muted hover:border-text/45"
        />
      </Field>

      <RangeField
        label="Max price"
        value={filters.priceMaxCents ?? PRICE_MAX}
        max={PRICE_MAX}
        step={50_000}
        display={filters.priceMaxCents === null ? "Any" : money(filters.priceMaxCents)}
        onChange={(value) => set("priceMaxCents", value === PRICE_MAX ? null : value)}
      />

      <RangeField
        label="Max mileage"
        value={filters.mileageMaxKm ?? MILEAGE_MAX}
        max={MILEAGE_MAX}
        step={10_000}
        display={
          filters.mileageMaxKm === null
            ? "Any"
            : `${new Intl.NumberFormat("en-CA").format(filters.mileageMaxKm)} km`
        }
        onChange={(value) => set("mileageMaxKm", value === MILEAGE_MAX ? null : value)}
      />

      <Field label="Year from">
        <select
          value={filters.yearMin ?? ""}
          onChange={(event) => set("yearMin", event.target.value ? Number(event.target.value) : null)}
          className="h-9 w-full border border-divider bg-bg px-2.5 text-[14px] hover:border-text/45"
        >
          <option value="">Any year</option>
          {Array.from({ length: 20 }, (_, index) => 2026 - index).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </Field>

      <ChipField
        label="Transmission"
        value={filters.transmission}
        options={[
          { value: "automatic", label: "Automatic" },
          { value: "manual", label: "Manual" },
        ]}
        onChange={(value) => set("transmission", value)}
      />

      <ChipField
        label="Fuel"
        value={filters.fuel}
        options={[
          { value: "gas", label: "Gas" },
          { value: "diesel", label: "Diesel" },
          { value: "hybrid", label: "Hybrid" },
          { value: "electric", label: "Electric" },
        ]}
        onChange={(value) => set("fuel", value)}
      />

      <ChipField
        label="Location"
        value={filters.city}
        options={[
          { value: "Charlottetown", label: "Charlottetown" },
          { value: "Moncton", label: "Moncton" },
          { value: "Halifax", label: "Halifax" },
          { value: "Fredericton", label: "Fredericton" },
        ]}
        onChange={(value) => set("city", value)}
      />

      <p aria-live="polite" className="border-t border-divider pt-4 text-[13px] text-text-secondary">
        <span className="tabular text-text">{resultCount}</span>{" "}
        {resultCount === 1 ? "listing" : "listings"} match
      </p>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="micro text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function RangeField({
  label,
  value,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <span className="micro text-text-muted">{label}</span>
        <span className="tabular text-[13px] text-text">{display}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-300 accent-accent"
      />
    </label>
  );
}

function ChipField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="micro text-text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? null : option.value)}
              className={cx(
                "border px-2.5 py-1 text-[13px] transition-colors duration-150 ease-out",
                active
                  ? "border-accent bg-accent-100 text-text"
                  : "border-divider text-text-secondary hover:border-text/45 hover:text-text",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
