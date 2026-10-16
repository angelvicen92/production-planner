import { z } from "zod";

export const headerScopeTypeSchema = z.enum(["zone", "space", "itinerant_team"]);
export const headerScopeSchema = z.object({ scopeType: headerScopeTypeSchema, scopeId: z.number().int().positive().safe() }).strict();
export type HeaderScope = z.infer<typeof headerScopeSchema>;
export const headerLineSchema = z.object({
  label: z.string().trim().max(80).refine(value => !value.includes("\u0000")).default(""),
  text: z.string().trim().min(1).max(4000).refine(value => !value.includes("\u0000")),
}).strict();
// Array position is the presentation order; replacing one scope is atomic.
export const headerLinesSchema = z.array(headerLineSchema).max(20).refine(lines => lines.reduce((sum, line) => sum + line.label.length + line.text.length, 0) <= 16000, "Máximo 16000 caracteres por cabecera.");
export type HeaderLine = z.infer<typeof headerLineSchema>;
export const saveHeaderNotesSchema = z.object({ expectedVersion: z.number().int().min(0).max(2147483646), lines: headerLinesSchema }).strict();
export const headerNotesSchema = headerScopeSchema.extend({ version: z.number().int().positive(), lines: headerLinesSchema });
export type HeaderNotes = z.infer<typeof headerNotesSchema>;
export const headerNotesPath = "/api/plans/:planId/header-notes";
export const headerScopeKey = (scope: HeaderScope) => `${scope.scopeType}:${scope.scopeId}`;
