import { z } from "zod";
import { DrivetrainSchema, FuelSchema, TransmissionSchema } from "./vehicle";

/**
 * What the user is actually shopping for. Drives the Fit score and mutes listings
 * that don't qualify. The options page renders this as a form; the
 * `criteria-interpreter` agent is a fast path into the same shape, never a
 * replacement for it.
 */
export const SavedCriteriaSchema = z.strictObject({
  budgetMinCents: z.number().int().nonnegative(),
  budgetMaxCents: z.number().int().positive(),
  maxMileageKm: z.number().int().positive().nullable(),
  yearMin: z.number().int().min(1900).max(2100).nullable(),
  yearMax: z.number().int().min(1900).max(2100).nullable(),
  radiusKm: z.number().int().positive(),
  originCity: z.string().min(1),
  transmission: z.array(TransmissionSchema),
  drivetrain: z.array(DrivetrainSchema),
  fuel: z.array(FuelSchema),
  /** Free-text exclusions the risk-analyst and Fit score both read. */
  excludes: z.array(z.string().max(120)).max(20),
  /** Hide listings that fail hard constraints instead of badging them. */
  muteNonQualifying: z.boolean(),
});
export type SavedCriteria = z.infer<typeof SavedCriteriaSchema>;

export const DEFAULT_CRITERIA: SavedCriteria = {
  budgetMinCents: 0,
  budgetMaxCents: 15_000_00,
  maxMileageKm: 200_000,
  yearMin: 2010,
  yearMax: null,
  radiusKm: 100,
  originCity: "Charlottetown",
  transmission: [],
  drivetrain: [],
  fuel: [],
  excludes: [],
  muteNonQualifying: false,
};
