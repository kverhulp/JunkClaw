import { z } from "zod";

export const TransmissionSchema = z.enum(["automatic", "manual", "unknown"]);
export type Transmission = z.infer<typeof TransmissionSchema>;

export const DrivetrainSchema = z.enum(["fwd", "rwd", "awd", "4wd", "unknown"]);
export type Drivetrain = z.infer<typeof DrivetrainSchema>;

export const FuelSchema = z.enum(["gas", "diesel", "hybrid", "electric", "unknown"]);
export type Fuel = z.infer<typeof FuelSchema>;

/**
 * What the listing is a listing *of*. Produced by the `listing-extractor` agent
 * (regex fast path first, model only on miss) from title + description.
 */
export const VehicleSchema = z.strictObject({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1900).max(2100),
  trim: z.string().nullable(),
  mileageKm: z.number().int().nonnegative().nullable(),
  transmission: TransmissionSchema,
  drivetrain: DrivetrainSchema,
  fuel: FuelSchema,
  /** Rare in private listings, and the single highest-value field when present. */
  vin: z
    .string()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/i, "VIN is 17 chars, no I/O/Q")
    .nullable(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;
