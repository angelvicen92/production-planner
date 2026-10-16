import type { Express, RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { headerNotesPath, headerNotesSchema, headerScopeTypeSchema, saveHeaderNotesSchema } from "../shared/planningHeaderNotes";

const id = z.coerce.number().int().positive().safe();
function response<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error("HEADER_RESPONSE_UNAVAILABLE");
  return parsed.data;
}
export function registerPlanningHeaderNotesRoutes(app: Express, db: SupabaseClient) {
  const handler = (work: (req: Parameters<RequestHandler>[0]) => Promise<unknown>): RequestHandler => async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await work(req)); }
    catch (error: any) {
      const code = String(error?.message ?? "");
      const status = error instanceof z.ZodError || /HEADER_INVALID/.test(code) ? 400 : /HEADER_FORBIDDEN/.test(code) ? 403 : /HEADER_NOT_FOUND/.test(code) ? 404 : /HEADER_STALE/.test(code) ? 409 : 503;
      res.status(status).json({ message: status === 409 ? "La cabecera ha cambiado. Vuelve a abrir el editor antes de guardar." : status === 400 ? "Cabecera no válida. Revisa el ámbito y los límites de texto." : status === 403 ? "No tienes permisos para editar cabeceras." : status === 404 ? "Jornada no encontrada." : "No se pudieron leer o guardar las indicaciones compartidas. Reintenta la operación." });
    }
  };
  app.get(headerNotesPath, handler(async req => {
    const planId = id.parse(req.params.planId);
    const { data: plan, error: planError } = await db.from("plans").select("id").eq("id", planId).maybeSingle();
    if (planError) throw planError;
    if (!plan) throw new Error("HEADER_NOT_FOUND");
    const { data, error } = await db.from("plan_header_notes").select("scope_type,scope_id,version,lines").eq("plan_id", planId);
    if (error) throw error;
    return response(z.array(headerNotesSchema), (data ?? []).map(row => ({ scopeType: row.scope_type, scopeId: Number(row.scope_id), version: row.version, lines: row.lines })));
  }));
  app.put(`${headerNotesPath}/:scopeType/:scopeId`, handler(async req => {
    const input = saveHeaderNotesSchema.parse(req.body);
    const { data, error } = await db.rpc("save_planning_header_notes", {
      p_plan: id.parse(req.params.planId), p_actor: (req as any).user.id,
      p_scope: headerScopeTypeSchema.parse(req.params.scopeType), p_scope_id: id.parse(req.params.scopeId),
      p_version: input.expectedVersion, p_lines: input.lines,
    });
    if (error) throw error;
    return response(headerNotesSchema, data);
  }));
}
