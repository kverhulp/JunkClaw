"use client";

import { useEffect, useState } from "react";

import { Badge, Button, cx, Table, Td, Th } from "../ui/primitives";
import { Drawer } from "../ui/interactive";
import {
  ASKING_PRICE_CAVEAT,
  CONFIDENCE_COPY,
  kilometres,
  money,
  signedMoney,
  titleCase,
} from "../../lib/format";
import { supplierLabel, type CatalogueListing } from "../../mocks/vehicles";

const RISK_LABELS: Record<string, string> = {
  salvage_or_rebuilt: "Salvage or rebuilt title",
  rust: "Rust",
  needs_work: "Needs work",
  no_maintenance_records: "No maintenance records",
  odometer_inconsistency: "Odometer inconsistency",
  dealer_posing_as_private: "Dealer posing as private",
  accident_history: "Accident history",
  title_issue: "Title issue",
};

/**
 * Everything known about one listing.
 *
 * Ordered by what decides a purchase: the price judgement first, then the risks
 * that would change it, then specifications, then provenance. Scraped metadata
 * is last because it matters to us, not to the person buying a car.
 */
export function CarSuperDataDrawer({
  listing,
  onClose,
}: {
  listing: CatalogueListing | null;
  onClose: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setPhotoIndex(0);
  }, [listing?.id]);

  if (!listing) return null;

  const { vehicle, analysis } = listing;
  const title = `${vehicle.year} ${titleCase(vehicle.make)} ${titleCase(vehicle.model)}`;
  const delta = analysis?.priceDeltaCents ?? null;
  const belowMarket = delta !== null && delta < 0;
  const confidence = analysis?.comps.confidence ?? "insufficient";

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary">Draft a message</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Gallery listing={listing} index={photoIndex} onIndexChange={setPhotoIndex} title={title} />

        {/* Price judgement — the reason the drawer exists. */}
        <section className="border border-divider bg-bg p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="micro text-text-muted">Asking price</p>
              <p className="tabular mt-1 text-[28px] font-semibold leading-none">
                {money(listing.priceCents)}
              </p>
            </div>

            {delta === null ? (
              <Badge tone="neutral">{CONFIDENCE_COPY.insufficient.label}</Badge>
            ) : (
              <div className="text-right">
                <p
                  className={cx(
                    "tabular text-[20px] font-semibold leading-none",
                    belowMarket ? "text-accent-700" : "text-text",
                  )}
                >
                  {signedMoney(delta)}
                </p>
                <p className="mt-1 text-[13px] text-text-secondary">{ASKING_PRICE_CAVEAT}</p>
              </div>
            )}
          </div>

          {analysis ? (
            <div className="mt-4 border-t border-divider pt-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-text-secondary">
                <span>
                  Median{" "}
                  <span className="tabular text-text">{money(analysis.comps.medianPriceCents)}</span>
                </span>
                <span>
                  Range{" "}
                  <span className="tabular text-text">
                    {money(analysis.comps.p25PriceCents)}–{money(analysis.comps.p75PriceCents)}
                  </span>
                </span>
                <span>
                  <span className="tabular text-text">{analysis.daysOnMarket}</span> days listed
                </span>
                {analysis.priceDropCount > 0 ? (
                  <span>
                    <span className="tabular text-text">{analysis.priceDropCount}</span> price drop
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-[13px] text-text-muted">
                {CONFIDENCE_COPY[confidence].blurb}
                {analysis.comps.wideningNote ? ` ${analysis.comps.wideningNote}.` : ""}
              </p>
            </div>
          ) : (
            <p className="mt-4 border-t border-divider pt-3 text-[13px] text-text-secondary">
              {CONFIDENCE_COPY.insufficient.blurb} We would rather show nothing than a number we
              cannot stand behind.
            </p>
          )}
        </section>

        {analysis && analysis.riskFlags.length > 0 ? (
          <section>
            <h3 className="text-[15px] font-medium">Potential concerns</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {analysis.riskFlags.map((flag, index) => (
                <li
                  key={`${flag.kind}-${index}`}
                  className="border border-divider bg-neutral-200 p-3"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone="warning">{RISK_LABELS[flag.kind] ?? flag.kind}</Badge>
                    <span className="text-[12px] text-text-muted">{flag.confidence} confidence</span>
                  </div>
                  {/* Every flag shows the sentence that triggered it — a warning
                      the user cannot check is worse than no warning. */}
                  <p className="mt-2 text-[14px] italic text-text-secondary">“{flag.evidence}”</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="text-[15px] font-medium">Specifications</h3>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden border border-divider bg-line sm:grid-cols-3">
            <Spec label="Year" value={String(vehicle.year)} />
            <Spec label="Mileage" value={kilometres(vehicle.mileageKm)} />
            <Spec label="Trim" value={vehicle.trim ? titleCase(vehicle.trim) : "Not stated"} />
            <Spec label="Transmission" value={titleCase(vehicle.transmission)} />
            <Spec label="Drivetrain" value={vehicle.drivetrain.toUpperCase()} />
            <Spec label="Fuel" value={titleCase(vehicle.fuel)} />
            <Spec label="VIN" value={vehicle.vin ?? "Not provided — ask the seller"} span />
          </dl>
        </section>

        <section>
          <h3 className="text-[15px] font-medium">Seller notes</h3>
          <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-text-secondary">
            {listing.description}
          </p>
        </section>

        <section>
          <h3 className="text-[15px] font-medium">Source metadata</h3>
          <Table className="mt-3">
            <tbody>
              <MetaRow label="Supplier" value={supplierLabel(listing.source)} />
              <MetaRow label="Original listing ID" value={listing.externalId} mono />
              <MetaRow label="Seller type" value={listing.isDealer ? "Dealer" : "Private seller"} />
              <MetaRow
                label="First seen"
                value={new Date(listing.firstSeenAt).toLocaleDateString("en-CA")}
              />
              <MetaRow
                label="Last seen"
                value={new Date(listing.lastSeenAt).toLocaleDateString("en-CA")}
              />
              <MetaRow label="URL hash" value={`${listing.urlHash.slice(0, 16)}…`} mono />
            </tbody>
          </Table>
          {/* We hash the URL rather than storing it, so there is no link to open. */}
          <p className="mt-2 text-[13px] text-text-muted">
            We store a hash of the listing URL rather than the URL itself, so this view cannot
            link out to the original.
          </p>
        </section>
      </div>
    </Drawer>
  );
}

function Gallery({
  listing,
  index,
  onIndexChange,
  title,
}: {
  listing: CatalogueListing;
  index: number;
  onIndexChange: (index: number) => void;
  title: string;
}) {
  return (
    <section aria-label="Photos">
      <div className="overflow-hidden border border-divider bg-bg">
        <img
          src={listing.photoUrls[index]}
          alt={`${title}, photo ${index + 1} of ${listing.photoUrls.length}`}
          className="aspect-[3/2] w-full object-cover"
        />
      </div>

      {listing.photoUrls.length > 1 ? (
        <div role="tablist" aria-label="Photo thumbnails" className="mt-2 flex gap-2">
          {listing.photoUrls.map((photo, photoIndex) => (
            <button
              key={photo.slice(-24)}
              role="tab"
              aria-selected={photoIndex === index}
              aria-label={`Photo ${photoIndex + 1}`}
              onClick={() => onIndexChange(photoIndex)}
              className={cx(
                "h-14 w-20 overflow-hidden border transition-[border-color] duration-150 ease-out",
                photoIndex === index ? "border-accent" : "border-divider hover:border-text/45",
              )}
            >
              <img src={photo} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Spec({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={cx("bg-surface px-3 py-2.5", span && "col-span-2 sm:col-span-3")}>
      <dt className="micro text-text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-[14px]">{value}</dd>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr>
      <Th className="w-40 normal-case tracking-normal">{label}</Th>
      <Td className={mono ? "font-mono text-[13px]" : undefined}>{value}</Td>
    </tr>
  );
}
