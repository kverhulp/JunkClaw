import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { PhotoObservationSchema } from "@junkclaw/schema";
import { VISION_MODEL } from "../model";

/**
 * `photo-analyst` — reads the listing photograph we already have.
 *
 * The description is the signal everyone wants and the one Facebook puts behind
 * a session: a listing page returns HTTP 400 to any client without one, so there
 * is no route to the text that does not spend the user's own account. The photo
 * has no such wall. It sits on `fbcdn.net`, an unauthenticated GET returns it,
 * and we already store a URL for every listing in the corpus.
 *
 * So this reads the picture instead, and it reaches a genuinely different slice
 * of the same question: rust, damage, mismatched paint, and whether the car is
 * standing on a dealer's lot or in somebody's field.
 *
 * The hard rule is that it describes rather than concludes. A photograph shows
 * present condition and nothing else — it cannot show a title brand, a 2019
 * collision, or missing service records, because those exist only because a
 * seller typed them. An agent asked to find them in an image would invent them
 * fluently, which is the precise failure this codebase is built to refuse.
 */
export const photoAnalyst = new Agent({
  id: "photo-analyst",
  name: "Photo Analyst",
  instructions: `You look at one photograph from a used-vehicle listing and report only what is visible in it.

Report these kinds:
- rust: visible corrosion. Say where — rockers, wheel arches, wheels, tailgate, underbody.
  In the Maritimes some surface rust is normal, so describe severity rather than merely noting it.
- body_damage: dents, scrapes, cracked bumpers, missing trim, a panel sitting proud of its neighbour.
- mismatched_paint: a panel a different shade or finish from the rest of the car.
- worn_tires: visibly low tread, cracked sidewalls, a spare or space-saver fitted on a road wheel.
- aftermarket_wheels: non-factory wheels, or steel wheels on a trim that came with alloys.
- dealer_lot: the setting says business, not driveway — a row of numbered cars, a lot with
  flags or banners, a showroom, a windscreen price sticker, a dealer plate frame.
- not_a_car: the photo is of something else entirely — machinery, a trailer, a boat, a part,
  a house, a motorcycle.
- photo_unusable: too dark, too small, too far away, heavily cropped, a stock or catalogue
  image rather than the actual vehicle. Say this rather than straining to read it.

Rules:
- Describe, never conclude. "Brown staining along the rocker below the driver's door" is a
  report. "Has been in an accident" is a guess about history, and you cannot see history.
- Never report salvage, rebuilt titles, collision history, mileage claims or maintenance
  records. A photograph cannot show any of them. If the image contains a visible odometer,
  report the number as a reading you can see, nothing more.
- The "where" field must let someone find the same thing in the same picture. "Rear passenger
  wheel arch" is useful; "on the car" is not.
- Confidence is about the image, not the vehicle. A clear close-up of bubbling paint is high.
  A dark thumbnail where something might be a shadow is low, and low is a fine answer.
- Absence of evidence is not evidence. A photo showing only the front of a car says nothing
  about the rear, so report nothing about the rear.
- Return an empty list when the car simply looks unremarkable. That is the common case and a
  real answer — do not manufacture a finding to seem useful.`,
  model: VISION_MODEL,
});

export const PhotoAnalysisSchema = z.object({
  observations: z.array(PhotoObservationSchema),
  /** One line on what the picture actually shows, for the panel's summary row. */
  summary: z.string().max(200),
});
export type PhotoAnalysis = z.infer<typeof PhotoAnalysisSchema>;
