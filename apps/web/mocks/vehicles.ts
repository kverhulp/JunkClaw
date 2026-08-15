import type {
  Analysis,
  CompConfidence,
  EnrichedListing,
  RiskFlag,
  Source,
} from "@junkclaw/schema";

/**
 * Mock data for the frontend, typed against the real backend contracts in
 * `@junkclaw/schema`. When Kody's endpoints land, the hooks in `lib/data.ts`
 * swap their source and nothing in the components changes.
 *
 * Photos come from `ListingFacts.photoUrls`, which the ingest boundary now
 * carries — no frontend-only view model, and no field the contract does not
 * have. The schema notes that these are signed Facebook CDN URLs which expire
 * within days, so a stored URL eventually renders blank; the grid and drawer
 * both need to degrade quietly when one does, rather than showing a broken
 * image frame.
 *
 * The mock URLs here are locally-generated SVG data URIs. Nothing in this app
 * fetches an external image.
 */

/**
 * Facebook Marketplace is the only supplier.
 *
 * Kijiji and AutoTrader were dropped from scope: the schema's `Source` enum
 * still lists them, because that is a data contract and widening it later is
 * cheaper than migrating rows, but nothing in the product claims them. A
 * marketing page that advertises three sources when one collects is the kind of
 * small dishonesty this product cannot afford — its entire proposition is
 * refusing to state what it cannot back.
 */
export const SUPPLIER = {
  source: "marketplace",
  label: "Facebook Marketplace",
} as const satisfies { source: Source; label: string };

export function supplierLabel(source: Source): string {
  return source === SUPPLIER.source ? SUPPLIER.label : source;
}

/**
 * Deterministic placeholder art, generated as an inline SVG data URI.
 *
 * Local by construction: no CDN, no network request, no layout shift. Cream
 * tones from the Modernist override, and flat with square corners like the rest
 * of the system — nothing here should read as a real photograph, because it isn't.
 */
function photo(seed: number, label: string): string {
  const tones = ["#F2E9D5", "#E6D8BE", "#F7EFDD", "#D8C6A5"];
  const base = tones[seed % tones.length]!;
  const band = tones[(seed + 2) % tones.length]!;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
    <rect width="640" height="420" fill="${base}"/>
    <rect y="250" width="640" height="170" fill="${band}"/>
    <path d="M120 250h400l-40-70a40 40 0 0 0-33-18H193a40 40 0 0 0-33 18z" fill="#D8C6A5"/>
    <rect x="96" y="250" width="448" height="46" fill="#D8C6A5"/>
    <circle cx="184" cy="300" r="30" fill="#201e1d"/><circle cx="184" cy="300" r="13" fill="#D8C6A5"/>
    <circle cx="456" cy="300" r="30" fill="#201e1d"/><circle cx="456" cy="300" r="13" fill="#D8C6A5"/>
    <text x="32" y="52" fill="#201e1d" fill-opacity="0.5" font-family="Archivo,system-ui,sans-serif" font-size="19">${label}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, " "))}`;
}

/** 64 hex chars, as `urlHash` requires. Deterministic so renders are stable. */
function urlHash(seed: number): string {
  let value = "";
  for (let index = 0; index < 64; index += 1) {
    value += (((seed + 1) * 2654435761 * (index + 7)) % 16).toString(16);
  }
  return value;
}

/** The frontend view: the backend contract plus the ids and analysis it pairs with. */
export interface CatalogueListing extends EnrichedListing {
  /** Server-assigned id. Backend returns these from /api/ingest keyed by urlHash. */
  id: string;
  /** Null while the corpus cannot support a number. Renders as "not enough data". */
  analysis: Analysis | null;
}

interface Seed {
  source: Source;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  priceCents: number;
  previousPriceCents: number | null;
  mileageKm: number;
  city: string;
  region: string;
  isDealer: boolean;
  transmission: "automatic" | "manual" | "unknown";
  drivetrain: "fwd" | "rwd" | "awd" | "4wd" | "unknown";
  fuel: "gas" | "diesel" | "hybrid" | "electric" | "unknown";
  vin: string | null;
  daysAgo: number;
  description: string;
  /** Median of comparable asking prices. Null means the comp set was insufficient. */
  compMedianCents: number | null;
  compCount: number;
  risks: RiskFlag[];
}

/**
 * Drawn from the shapes the first collection run actually produced around
 * Moncton and Charlottetown — including the awkward ones. Two listings have no
 * comps on purpose: `insufficient` is the most common real answer in a market
 * this thin, and the UI has to look right when it fires.
 */
const SEEDS: Seed[] = [
  {
    source: "marketplace",
    year: 2013,
    make: "Honda",
    model: "Civic",
    trim: "EX",
    priceCents: 650_000,
    previousPriceCents: 720_000,
    mileageKm: 183_000,
    city: "Charlottetown",
    region: "PE",
    isDealer: false,
    transmission: "automatic",
    drivetrain: "fwd",
    fuel: "gas",
    vin: null,
    daysAgo: 21,
    description:
      "Runs great, no issues. Some surface rust on the rear quarter panel. No maintenance records, bought it from the original owner two years ago. AC works.",
    compMedianCents: 790_000,
    compCount: 7,
    risks: [
      { kind: "rust", evidence: "Some surface rust on the rear quarter panel.", confidence: "high" },
      {
        kind: "no_maintenance_records",
        evidence: "No maintenance records, bought it from the original owner two years ago.",
        confidence: "high",
      },
    ],
  },
  {
    source: "marketplace",
    year: 2017,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    priceCents: 1_899_900,
    previousPriceCents: null,
    mileageKm: 168_000,
    city: "Moncton",
    region: "NB",
    isDealer: false,
    transmission: "automatic",
    drivetrain: "4wd",
    fuel: "gas",
    vin: null,
    daysAgo: 4,
    description:
      "5.0 V8, tow package, new tires last fall. Clean truck, always garaged. Serious inquiries only.",
    compMedianCents: null,
    compCount: 2,
    risks: [],
  },
  {
    source: "marketplace",
    year: 2009,
    make: "Toyota",
    model: "Matrix",
    trim: null,
    priceCents: 350_000,
    previousPriceCents: null,
    mileageKm: 205_000,
    city: "Dieppe",
    region: "NB",
    isDealer: false,
    transmission: "manual",
    drivetrain: "fwd",
    fuel: "gas",
    vin: null,
    daysAgo: 33,
    description:
      "Selling as is. Needs front brakes and an exhaust patch before it will pass inspection. Body is solid.",
    compMedianCents: 412_500,
    compCount: 5,
    risks: [
      {
        kind: "needs_work",
        evidence: "Needs front brakes and an exhaust patch before it will pass inspection.",
        confidence: "high",
      },
    ],
  },
  {
    source: "marketplace",
    year: 2018,
    make: "Hyundai",
    model: "Elantra",
    trim: "GL",
    priceCents: 1_249_500,
    previousPriceCents: 1_349_500,
    mileageKm: 96_000,
    city: "Charlottetown",
    region: "PE",
    isDealer: true,
    transmission: "automatic",
    drivetrain: "fwd",
    fuel: "gas",
    vin: "5NPD84LF1JH123456",
    daysAgo: 12,
    description:
      "Certified pre-owned. Two previous owners, full service history available. Heated seats, backup camera, winter tires included.",
    compMedianCents: 1_318_000,
    compCount: 9,
    risks: [],
  },
  {
    source: "marketplace",
    year: 2014,
    make: "Subaru",
    model: "Outback",
    trim: "3.6R",
    priceCents: 989_000,
    previousPriceCents: null,
    mileageKm: 212_000,
    city: "Summerside",
    region: "PE",
    isDealer: false,
    transmission: "automatic",
    drivetrain: "awd",
    fuel: "gas",
    vin: null,
    daysAgo: 8,
    description:
      "Head gaskets done at 180k with receipts. Timing belt replaced same time. Rust on the rear wheel arches, typical for the year.",
    compMedianCents: 1_040_000,
    compCount: 4,
    risks: [
      { kind: "rust", evidence: "Rust on the rear wheel arches, typical for the year.", confidence: "medium" },
    ],
  },
  {
    source: "marketplace",
    year: 2011,
    make: "Chevrolet",
    model: "Cruze",
    trim: "LT",
    priceCents: 289_900,
    previousPriceCents: 340_000,
    mileageKm: 241_000,
    city: "Moncton",
    region: "NB",
    isDealer: false,
    transmission: "automatic",
    drivetrain: "fwd",
    fuel: "gas",
    vin: null,
    daysAgo: 46,
    description:
      "Rebuilt title from a 2019 collision, repaired professionally. Drives straight, no warning lights. Priced accordingly.",
    compMedianCents: 402_000,
    compCount: 6,
    risks: [
      {
        kind: "salvage_or_rebuilt",
        evidence: "Rebuilt title from a 2019 collision, repaired professionally.",
        confidence: "high",
      },
      { kind: "accident_history", evidence: "from a 2019 collision", confidence: "high" },
    ],
  },
  {
    source: "marketplace",
    year: 2020,
    make: "Mazda",
    model: "CX-5",
    trim: "GS",
    priceCents: 2_449_000,
    previousPriceCents: null,
    mileageKm: 78_000,
    city: "Halifax",
    region: "NS",
    isDealer: true,
    transmission: "automatic",
    drivetrain: "awd",
    fuel: "gas",
    vin: "JM3KFBCM6L0812345",
    daysAgo: 6,
    description:
      "One owner, accident free, CarFax available. Remaining factory powertrain warranty. Financing available on approved credit.",
    compMedianCents: 2_512_000,
    compCount: 11,
    risks: [],
  },
  {
    source: "marketplace",
    year: 2016,
    make: "Nissan",
    model: "Rogue",
    trim: "SV",
    priceCents: 1_195_000,
    previousPriceCents: 1_295_000,
    mileageKm: 154_000,
    city: "Fredericton",
    region: "NB",
    isDealer: true,
    transmission: "automatic",
    drivetrain: "awd",
    fuel: "gas",
    vin: "5N1AT2MV1GC891234",
    daysAgo: 27,
    description:
      "CVT serviced at 140,000 km. Two sets of tires. Minor door ding on the passenger side, shown in photos.",
    compMedianCents: 1_186_000,
    compCount: 8,
    risks: [],
  },
  {
    source: "marketplace",
    year: 2012,
    make: "BMW",
    model: "3",
    trim: "328i",
    priceCents: 749_000,
    previousPriceCents: null,
    mileageKm: 198_000,
    city: "Moncton",
    region: "NB",
    isDealer: false,
    transmission: "automatic",
    drivetrain: "rwd",
    fuel: "gas",
    vin: null,
    daysAgo: 15,
    description:
      "Well maintained, all service done at the dealer. Oil leak from the valve cover gasket, common issue, part is cheap.",
    compMedianCents: null,
    compCount: 1,
    risks: [
      { kind: "needs_work", evidence: "Oil leak from the valve cover gasket", confidence: "medium" },
    ],
  },
];

const NOW = new Date("2026-08-14T18:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function confidenceFor(count: number): CompConfidence {
  if (count < 3) return "insufficient";
  if (count < 5) return "low";
  if (count < 8) return "medium";
  return "high";
}

function build(seed: Seed, index: number): CatalogueListing {
  const id = `lst_${String(index + 1).padStart(4, "0")}`;
  const label = `${seed.year} ${seed.make} ${seed.model}`;
  const confidence = confidenceFor(seed.compCount);
  const hasComps = seed.compMedianCents !== null && confidence !== "insufficient";

  const analysis: Analysis | null = hasComps
    ? {
        listingId: id,
        priceDeltaCents: seed.priceCents - seed.compMedianCents!,
        dealScore: null,
        fitScore: null,
        daysOnMarket: seed.daysAgo,
        priceDropCount: seed.previousPriceCents === null ? 0 : 1,
        comps: {
          listingIds: [],
          medianPriceCents: seed.compMedianCents!,
          p25PriceCents: Math.round(seed.compMedianCents! * 0.88),
          p75PriceCents: Math.round(seed.compMedianCents! * 1.14),
          confidence,
          wideningNote:
            confidence === "low" ? "±2 years, any trim, within 250 km — the exact-year set was empty" : null,
        },
        riskFlags: seed.risks,
        computedAt: NOW.toISOString(),
      }
    : null;

  return {
    id,
    source: seed.source,
    externalId: `${seed.source}-${900_000_000 + index * 7919}`,
    urlHash: urlHash(index),
    rawTitle: `${label}${seed.trim ? ` ${seed.trim}` : ""}`,
    rawSubtitle: `${Math.round(seed.mileageKm / 1000)}K km`,
    priceCents: seed.priceCents,
    previousPriceCents: seed.previousPriceCents,
    currency: "CAD",
    location: { city: seed.city, region: seed.region, country: "CA" },
    isDealer: seed.isDealer,
    description: seed.description,
    firstSeenAt: daysBefore(seed.daysAgo),
    lastSeenAt: daysBefore(0),
    rawPayload: {
      creation_time: Math.floor((NOW.getTime() - seed.daysAgo * 86_400_000) / 1000),
      vehicle_odometer_data: { unit: "KILOMETERS", value: seed.mileageKm },
      vehicle_seller_type: seed.isDealer ? "DEALER" : "PRIVATE_SELLER",
      condition: "USED",
    },
    vehicle: {
      make: seed.make.toLowerCase(),
      model: seed.model.toLowerCase(),
      year: seed.year,
      trim: seed.trim,
      mileageKm: seed.mileageKm,
      transmission: seed.transmission,
      drivetrain: seed.drivetrain,
      fuel: seed.fuel,
      vin: seed.vin,
    },
    photoUrls: [photo(index, label), photo(index + 3, `${label} — interior`), photo(index + 5, `${label} — rear`)],
    analysis,
  };
}

export const MOCK_LISTINGS: CatalogueListing[] = SEEDS.map(build);

export function listingsBySupplier(source: Source): CatalogueListing[] {
  return MOCK_LISTINGS.filter((listing) => listing.source === source);
}

export function listingById(id: string): CatalogueListing | undefined {
  return MOCK_LISTINGS.find((listing) => listing.id === id);
}

/** Header ticker figures. Real ones come from the corpus once it is queryable. */
export const CORPUS_STATS = {
  listingsTracked: 106,
  medianDaysOnMarket: 16,
  priceDropsThisWeek: 11,
  /** Measured, not aspirational — see docs/findings/2026-08-14-m0-field-findings.md. */
  priceableShare: 0.17,
} as const;
