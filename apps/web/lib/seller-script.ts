import type { CatalogueListing } from "../mocks/vehicles";
import { money, titleCase } from "./format";

/**
 * Builds the seller script: what this car is worth against similar asks, what
 * is known to go wrong on it, what service it is due, and the questions those
 * three things imply.
 *
 * The product does not draft a message and does not name an offer. It hands the
 * user what to ask before they drive out — every line traceable to a comp, a
 * documented fault pattern, an odometer reading, or a sentence the seller wrote.
 * Nothing here tells anyone what to pay.
 *
 * TODO(integration): the known-issue set is a static table today. It becomes
 * the research agent's output, which is why `KnownIssue` already carries the
 * fields a sourced answer needs.
 */

export interface ScriptQuestion {
  /** Asked verbatim — the user reads this out. */
  ask: string;
  /** Why it is worth asking. Shown underneath, never merged into the question. */
  why: string;
}

export interface ScriptSection {
  title: string;
  /** Set when the section needs a caveat before its questions are read. */
  note: string | null;
  questions: ScriptQuestion[];
}

export interface KnownIssue {
  title: string;
  detail: string;
  /** What to ask the seller about it. */
  ask: string;
}

export interface ServiceItem {
  label: string;
  /** How many times it should have come due at this odometer reading. */
  dueCount: number;
  everyKm: number;
}

export interface MarketFact {
  label: string;
  value: string;
}

export interface SellerScript {
  /** Null when the comp set is insufficient — the script then asks, not states. */
  marketLine: string | null;
  facts: MarketFact[];
  knownIssues: KnownIssue[];
  service: ServiceItem[];
  sections: ScriptSection[];
}

/**
 * Documented fault patterns by generation, not by individual car.
 *
 * These are the ones a used-car buyer in this market will actually meet, and
 * each is specific enough to be checkable on a test drive or in the service
 * history. Vague warnings ("watch for electrical issues") are worse than none —
 * the user cannot act on them and cannot tell whether the seller's answer was
 * good.
 */
interface IssueEntry {
  make: string;
  model: string;
  /** Inclusive generation bounds. */
  from: number;
  to: number;
  issues: KnownIssue[];
}

const KNOWN_ISSUES: IssueEntry[] = [
  {
    make: "honda",
    model: "civic",
    from: 2012,
    to: 2015,
    issues: [
      {
        title: "A/C compressor clutch",
        detail: "Clutch failure is common on this generation and often takes the compressor with it.",
        ask: "Does the A/C blow cold on a long drive, not just at idle — and has the compressor ever been replaced?",
      },
      {
        title: "Front brake wear",
        detail: "Front pads and rotors wear early; many cars are on their third set by 180,000 km.",
        ask: "When were the front pads and rotors last done, and were rotors replaced or machined?",
      },
    ],
  },
  {
    make: "ford",
    model: "f-150",
    from: 2015,
    to: 2020,
    issues: [
      {
        title: "5.0 cam phaser rattle",
        detail: "A one-to-three second rattle on a cold start points at the variable cam timing phasers. The repair is engine-front labour, not a small bill.",
        ask: "Can I hear it start from stone cold — has it ever rattled for a second or two on startup?",
      },
      {
        title: "Transmission shift quality",
        detail: "Harsh or hunting 2-3 shifts on the 6R80 are widely reported and often blamed on 'it just does that'.",
        ask: "Has the transmission ever been flushed or reprogrammed, and does it shift cleanly when cold?",
      },
      {
        title: "Aluminium body panels",
        detail: "Body repairs on these need an aluminium-certified shop. A cheap repair on a panel is a real cost later.",
        ask: "Has any panel been repaired or replaced, and do you know which shop did it?",
      },
    ],
  },
  {
    make: "toyota",
    model: "matrix",
    from: 2009,
    to: 2013,
    issues: [
      {
        title: "2.4L oil consumption",
        detail: "The 2AZ-FE is known for burning oil through worn piston rings. Toyota extended coverage on it; that coverage is long expired.",
        ask: "How much oil does it use between changes — and can I see the dipstick right now?",
      },
    ],
  },
  {
    make: "hyundai",
    model: "elantra",
    from: 2017,
    to: 2020,
    issues: [
      {
        title: "Engine knock and the recall software",
        detail: "These engines have a recall-era knock-sensor update that watches for bearing wear. Whether it was applied is a matter of record.",
        ask: "Have all recalls been done at a dealer — can you tell me the last dealer visit so I can check the VIN?",
      },
      {
        title: "Steering coupler clunk",
        detail: "A knock from the column over small bumps is a known coupler fault, and a cheap fix that is often left undone.",
        ask: "Is there any clunk from the steering column over rough pavement?",
      },
    ],
  },
  {
    make: "subaru",
    model: "outback",
    from: 2010,
    to: 2019,
    issues: [
      {
        title: "CVT fluid service",
        detail: "The transmission is a CVT. Fluid is a real service item on it, and 'sealed for life' is how these get destroyed.",
        ask: "Has the CVT fluid ever been changed, and do you have the receipt?",
      },
      {
        title: "Oil seepage at the cam carriers",
        detail: "Seepage at the cam carrier and rear main is common at high mileage. Seepage is livable; a drip is not.",
        ask: "Is there any oil on the driveway where it parks?",
      },
    ],
  },
  {
    make: "chevrolet",
    model: "cruze",
    from: 2011,
    to: 2015,
    issues: [
      {
        title: "Coolant loss",
        detail: "The plastic water-outlet housing and thermostat housing crack and weep. Very common, and often chased for months.",
        ask: "Does it ever need coolant topped up, and has the water outlet or thermostat housing been replaced?",
      },
      {
        title: "Valve cover / PCV diaphragm",
        detail: "The PCV diaphragm is built into the valve cover. When it splits it causes a rough idle and can push out the rear main seal.",
        ask: "Has the valve cover been replaced, and does it idle smoothly when warm?",
      },
      {
        title: "1.4L turbo",
        detail: "Turbo failure on the 1.4 is well documented, especially where oil changes were stretched.",
        ask: "How often was the oil changed, and by whom?",
      },
    ],
  },
  {
    make: "nissan",
    model: "rogue",
    from: 2014,
    to: 2020,
    issues: [
      {
        title: "CVT judder and failure",
        detail: "The single biggest cost risk on this vehicle. Shudder under light acceleration or a delay pulling away are the early signs.",
        ask: "On the test drive, may I take it to highway speed and back — has the transmission ever been serviced or replaced?",
      },
    ],
  },
  {
    make: "bmw",
    model: "3",
    from: 2012,
    to: 2016,
    issues: [
      {
        title: "N20 timing chain guides",
        detail: "The four-cylinder turbo is known for timing chain guide wear. It is an engine-out job and it is the reason many of these are cheap.",
        ask: "Has the timing chain and guides been done, and is there any rattle from the front of the engine on a cold start?",
      },
      {
        title: "Oil filter housing gasket",
        detail: "Leaks from the filter housing onto the belt are routine at this age and mileage.",
        ask: "Are there any oil leaks, and when was the oil filter housing gasket last touched?",
      },
      {
        title: "Electric water pump",
        detail: "The pump is electric and fails without warning, usually taking the car off the road where it stops.",
        ask: "Has the water pump and thermostat been replaced?",
      },
    ],
  },
  {
    make: "mazda",
    model: "cx-5",
    from: 2017,
    to: 2024,
    issues: [
      {
        title: "Cylinder deactivation vibration",
        detail: "A low-speed shudder on the 2.5 with cylinder deactivation is a known characteristic rather than a fault — worth knowing so it is not mistaken for a transmission problem.",
        ask: "Does it vibrate at steady low speeds, and has a dealer ever looked at it?",
      },
    ],
  },
];

/**
 * Service that should have come due at this odometer reading.
 *
 * Deliberately generic and interval-based: these are the items every car in the
 * corpus shares. Anything engine-specific — a timing belt, say — is a claim
 * about a particular engine, and getting that wrong in either direction is
 * worse than leaving it to the known-issue table, where it can be stated for a
 * model we actually checked.
 */
const SERVICE_INTERVALS: Array<{ label: string; everyKm: number }> = [
  { label: "Transmission fluid", everyKm: 100_000 },
  { label: "Spark plugs", everyKm: 100_000 },
  { label: "Brake fluid", everyKm: 60_000 },
  { label: "Coolant", everyKm: 160_000 },
];

const RISK_QUESTIONS: Record<string, string> = {
  salvage_or_rebuilt: "Is the title clean, and can I see the registration before I come out?",
  rust: "Where exactly is the rust, and has any of it been repaired or covered?",
  needs_work: "What still needs doing, and has a shop quoted it?",
  no_maintenance_records: "Is there anything at all in writing — receipts, an oil-change sticker, a shop it always went to?",
  odometer_inconsistency: "What does the odometer read today, and does that match the last inspection sticker?",
  dealer_posing_as_private: "Are you selling this as a private owner or as a dealer?",
  accident_history: "Has it been in a collision, and was a claim filed?",
  title_issue: "Is there a lien on it, and is the title in your name?",
};

function issuesFor(listing: CatalogueListing): KnownIssue[] {
  const make = listing.vehicle.make.toLowerCase();
  const model = listing.vehicle.model.toLowerCase();
  const year = listing.vehicle.year;

  const entry = KNOWN_ISSUES.find(
    (candidate) =>
      candidate.make === make &&
      candidate.model === model &&
      year >= candidate.from &&
      year <= candidate.to,
  );

  return entry ? entry.issues : [];
}

/**
 * Empty when the odometer is unknown, which is common — a listing without a
 * mileage figure gets a question about the odometer instead of a service list
 * inferred from a number nobody has.
 */
function serviceFor(mileageKm: number | null): ServiceItem[] {
  if (mileageKm === null) return [];

  return SERVICE_INTERVALS.map((interval) => ({
    label: interval.label,
    everyKm: interval.everyKm,
    dueCount: Math.floor(mileageKm / interval.everyKm),
  })).filter((item) => item.dueCount >= 1);
}

function km(value: number): string {
  return `${value.toLocaleString("en-CA")} km`;
}

export function buildSellerScript(listing: CatalogueListing): SellerScript {
  const analysis = listing.analysis;
  const comps = analysis?.comps ?? null;
  const enoughComps = comps !== null && comps.confidence !== "insufficient";

  const knownIssues = issuesFor(listing);
  const service = serviceFor(listing.vehicle.mileageKm);

  /**
   * Asking prices, never "market value" or "worth". The corpus is what sellers
   * ask; saying anything stronger is the one claim that would cost us the
   * user's trust permanently.
   */
  const marketLine = enoughComps
    ? `Similar ones nearby are asking around ${money(comps.medianPriceCents)}, with most between ${money(
        comps.p25PriceCents,
      )} and ${money(comps.p75PriceCents)}.`
    : null;

  const facts: MarketFact[] = [{ label: "Asking", value: money(listing.priceCents) }];

  if (enoughComps) {
    facts.push({ label: "Similar asks", value: money(comps.medianPriceCents) });
    facts.push({
      label: "Typical range",
      value: `${money(comps.p25PriceCents)} – ${money(comps.p75PriceCents)}`,
    });
  }

  if (analysis) {
    facts.push({ label: "Days listed", value: `${analysis.daysOnMarket}` });
    if (analysis.priceDropCount > 0) {
      facts.push({
        label: "Price drops",
        value: `${analysis.priceDropCount}`,
      });
    }
  }

  facts.push({
    label: "Odometer",
    value: listing.vehicle.mileageKm === null ? "Not stated" : km(listing.vehicle.mileageKm),
  });

  const sections: ScriptSection[] = [];

  sections.push({
    title: "Open with these",
    note: null,
    questions: [
      {
        ask: "Is it still available, and are you the registered owner?",
        why: "Settles both in one question, and a hesitation on the second is worth hearing.",
      },
      {
        ask: "Could you send me the VIN?",
        why: "Most private listings omit it. It is the single highest-value thing you can get before driving out — recalls, history, and trim all hang off it.",
      },
      {
        ask: "How long have you had it, and why are you selling?",
        why: "A short ownership on an older car is worth understanding before you spend an evening on it.",
      },
    ],
  });

  if (knownIssues.length > 0) {
    sections.push({
      title: `Known on the ${listing.vehicle.year} ${titleCase(listing.vehicle.model)}`,
      note: "These are documented patterns for this generation, not accusations about this car.",
      questions: knownIssues.map((issue) => ({ ask: issue.ask, why: issue.detail })),
    });
  }

  if (service.length > 0 && listing.vehicle.mileageKm !== null) {
    sections.push({
      title: "Service the odometer implies",
      note: `At ${km(
        listing.vehicle.mileageKm,
      )} these have come due at least once. "I don't know" is an answer too — it prices the car.`,
      questions: service.map((item) => ({
        ask: `When was the ${item.label.toLowerCase()} last done?`,
        why: `Due about every ${km(item.everyKm)} — roughly ${item.dueCount} ${
          item.dueCount === 1 ? "time" : "times"
        } by now.`,
      })),
    });
  } else if (listing.vehicle.mileageKm === null) {
    sections.push({
      title: "The listing does not say",
      note: null,
      questions: [
        {
          ask: "What does the odometer read?",
          why: "The listing omits it, and mileage decides which services are overdue and what the car is comparable to.",
        },
      ],
    });
  }

  const riskQuestions = (analysis?.riskFlags ?? [])
    .map((flag) => {
      const ask = RISK_QUESTIONS[flag.kind];
      return ask ? { ask, why: `From the listing: "${flag.evidence}"` } : null;
    })
    .filter((question): question is ScriptQuestion => question !== null);

  if (riskQuestions.length > 0) {
    sections.push({
      title: "From what the seller wrote",
      note: "Each of these came out of the listing text, quoted underneath so you can check it yourself.",
      questions: riskQuestions,
    });
  }

  sections.push({
    title: "Before you agree to anything",
    note: null,
    questions: [
      {
        ask: "Would you be okay with me putting it on a hoist at a shop of my choosing?",
        why: "A pre-purchase inspection is the cheapest money in the process, and a refusal tells you something on its own.",
      },
      {
        ask: enoughComps
          ? `Similar ones nearby are asking around ${money(comps.medianPriceCents)} — how did you land on your price?`
          : "How did you land on your price?",
        why: enoughComps
          ? "States what the comparable asks are and lets the seller respond to it. It is not an offer, and it does not name one."
          : "There were not enough comparable listings nearby to say what similar ones ask, so this asks rather than states.",
      },
    ],
  });

  return { marketLine, facts, knownIssues, service, sections };
}

/** Plain-text version for the clipboard. Nothing is sent anywhere. */
export function scriptToText(listing: CatalogueListing, script: SellerScript): string {
  const title = `${listing.vehicle.year} ${titleCase(listing.vehicle.make)} ${titleCase(
    listing.vehicle.model,
  )}`;

  const lines: string[] = [`${title} — questions for the seller`, ""];

  if (script.marketLine) lines.push(script.marketLine, "");

  for (const section of script.sections) {
    lines.push(section.title.toUpperCase());
    for (const question of section.questions) lines.push(`  - ${question.ask}`);
    lines.push("");
  }

  lines.push("Asking prices only — not sale prices, and not an offer.");
  return lines.join("\n");
}
