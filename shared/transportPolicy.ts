import { z } from "zod";
import type { EngineInput } from "../engine/types";

export const transportBoundsFields = {
  arrivalMinimumGroupSize: z.number().int().positive().nullable().optional(),
  departureMinimumGroupSize: z.number().int().positive().nullable().optional(),
  arrivalMaximumGroupSize: z.number().int().positive().nullable().optional(),
  departureMaximumGroupSize: z.number().int().positive().nullable().optional(),
};
export const transportBoundsSchema = z.object({
  ...transportBoundsFields,
  vanCapacity: z.number().int().nonnegative().optional(),
}).passthrough().superRefine((value, ctx) => {
  for (const direction of ["arrival", "departure"] as const) {
    const minimum = value[`${direction}MinimumGroupSize`] ?? 1;
    const maximum = value[`${direction}MaximumGroupSize`] ?? value.vanCapacity;
    // Zero vehicle capacity is the historical unconfigured value. The engine
    // still requires a positive effective maximum before it can plan transport.
    if (maximum != null && maximum > 0 && minimum > maximum)
      ctx.addIssue({code: z.ZodIssueCode.custom, path: [`${direction}MinimumGroupSize`], message: "El mínimo HARD no puede superar el máximo HARD."});
  }
});

/** Human edits are rejected, never rounded or silently clamped. Historical
 * snapshot normalization keeps its existing read compatibility separately. */
export const transportParametersSchema = z.object({
  ...transportBoundsFields,
  arrivalGroupingTarget:z.number().int().nonnegative().optional(),
  departureGroupingTarget:z.number().int().nonnegative().optional(),
  arrivalMinGapMinutes:z.number().int().nonnegative().optional(),
  departureMinGapMinutes:z.number().int().nonnegative().optional(),
  vanCapacity:z.number().int().nonnegative().optional(),
}).passthrough().superRefine((value,ctx)=>{
  const bounds=transportBoundsSchema.safeParse(value);
  if(!bounds.success)for(const issue of bounds.error.issues)ctx.addIssue(issue);
});

/** Absent historical minimum means 1. Zero legacy target means unspecified.
 * A positive target outside [minimum, maximum] is retained as a preference;
 * construction ranks the nearest legal sizes, without changing human input. */
export function effectiveTransportDirection(input: EngineInput, direction: "arrival" | "departure") {
  const settings = input.transportSettings;
  const target = input[`${direction}GroupingTarget`] ?? settings?.[`${direction}TargetGroupSize`];
  return {
    targetGroupSize: target === 0 || target == null ? undefined : target,
    minimumGroupSize: input[`${direction}MinimumGroupSize`] ?? settings?.[`${direction}MinimumGroupSize`] ?? 1,
    maximumGroupSize: input[`${direction}MaximumGroupSize`] ?? settings?.[`${direction}MaximumGroupSize`] ?? input.vanCapacity ?? input.transportVanCapacity ?? settings?.vehicleCapacity ?? settings?.vanCapacity ?? undefined,
    minGapMinutes: input[`${direction}MinGapMinutes`] ?? settings?.[`${direction}MinGapMinutes`] ?? undefined,
  };
}
