import { z } from "zod";

export class SpatialEntityNotFoundError extends Error {
  constructor() { super("Not found"); }
}
export class SpatialRequestValidationError extends Error {}

export function parsePositiveIntegerRouteId(value: unknown, field: string): number {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) throw new SpatialRequestValidationError(`Invalid ${field}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new SpatialRequestValidationError(`Invalid ${field}`);
  return parsed;
}

export function parseSpatialRequestBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new SpatialRequestValidationError(result.error.errors[0]?.message ?? "Invalid request");
  return result.data;
}

export function spatialAvailabilityErrorResponse(error: unknown): Readonly<{ status: 400 | 404 | 500; body: { message: string } }> {
  if (error instanceof SpatialRequestValidationError) return { status: 400, body: { message: error.message || "Invalid request" } };
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (error instanceof SpatialEntityNotFoundError || code === "PGRST116" || code === "42501") return { status: 404, body: { message: "Not found" } };
  return { status: 500, body: { message: "Internal Server Error" } };
}

export async function executeSpatialAvailabilityAction<T>(action: () => Promise<T>): Promise<Readonly<{ status: 200; body: T }> | ReturnType<typeof spatialAvailabilityErrorResponse>> {
  try { return { status: 200, body: await action() }; }
  catch (error) { return spatialAvailabilityErrorResponse(error); }
}
