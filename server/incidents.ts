import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { api } from '../shared/routes';
import { supabaseAdmin } from './supabase';
import { incidentError } from './incidentErrors';


export function registerIncidentRoutes(app: Express) {
  const confirmed = <T>(schema: z.ZodType<T>, data: unknown): T => {
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new Error('INCIDENT_RESPONSE_INVALID');
    return parsed.data;
  };
  const id = z.coerce.number().int().positive().safe();
  const uuid = z.string().uuid();
  const handler = (action: (req: Parameters<RequestHandler>[0]) => Promise<unknown>, status = 200): RequestHandler => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.status(status).json(await action(req)); }
    catch (error) { const failure = incidentError(error); res.status(failure.status).json({ message: req.method === 'GET' && failure.status >= 500 ? 'No se pudo consultar el registro compartido. Reintenta la consulta.' : failure.message }); }
  };
  const query = async (req: Parameters<RequestHandler>[0], context = false) => {
    const { data, error } = await supabaseAdmin.rpc('incident_query', {
      p_plan: id.parse(req.params.planId), p_actor: (req as any).user.id,
      p_id: req.params.incidentId ? uuid.parse(req.params.incidentId) : null, p_context: context,
    });
    if (error) throw error;
    return data;
  };
  app.get(api.incidents.context.path, handler(async req => confirmed(api.incidents.context.responses[200], await query(req, true))));
  app.get(api.incidents.list.path, handler(async req => confirmed(api.incidents.list.responses[200], await query(req))));
  app.get(api.incidents.detail.path, handler(async req => confirmed(api.incidents.detail.responses[200], await query(req))));
  for (const action of ['create', 'update', 'resolve', 'reopen', 'escalate'] as const) {
    const contract = api.incidents[action];
    const execute = handler(async req => {
      const input = contract.input.parse(req.body);
      const { expectedVersion, ...fields } = input as typeof input & { expectedVersion?: number };
      const { data, error } = await supabaseAdmin.rpc('incident_command', {
        p_plan: id.parse(req.params.planId), p_actor: (req as any).user.id, p_action: action,
        p_actor_label: (req as any).user.email ?? null, p_fields: fields, p_id: action === 'create' ? null : uuid.parse(req.params.incidentId), p_version: expectedVersion ?? null,
      });
      if (error) throw error;
      return confirmed(api.incidents.list.responses[200].element, data);
    }, action === 'create' ? 201 : 200);
    if (action === 'update') app.patch(contract.path, execute); else app.post(contract.path, execute);
  }
  app.use(api.incidents.list.path, (_req, res) => {
    res.status(404).json({ message: 'Esta operación de incidencias no está disponible.' });
  });
}
