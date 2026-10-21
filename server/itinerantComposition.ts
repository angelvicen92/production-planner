import type { Express } from 'express';
import { z } from 'zod';
import { api } from '../shared/routes';
import { dailyItinerantUnitSchema, type ItinerantTeam } from '../shared/itinerantComposition';
import type { EngineInput } from '../engine/types';

export class ItinerantCompositionError extends Error {
  readonly code = 'ITINERANT_CONFIGURATION_ERROR';
  readonly status = 409;
  constructor(reason: string) { super(`Configuración de equipos itinerantes: ${reason}. Revisa la composición y sus correspondencias diarias.`); }
}

export function mapItinerantTeam(row: any): ItinerantTeam {
  return { id: Number(row.id), code: row.code, name: row.name, isActive: row.is_active,
    orderIndex: row.order_index, revision: row.revision,
    availabilityWindows: row.availability_windows, transitionMinutes: row.transition_minutes,
    resourceItemIds: (row.itinerant_team_members ?? []).map((member: any) => Number(member.resource_item_id)).sort((a: number,b: number)=>a-b) };
}

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{data: any; error: any}>;
export function registerItinerantCompositionRoutes(app: Express, rpc: Rpc) {
  const save = (update: boolean) => async (req: any, res: any) => {
    if (!req.user?.id) return res.status(401).json({message:'Unauthorized'});
    if (req.userRole !== 'admin') return res.status(403).json({message:'Solo ADMIN puede editar el catálogo.'});
    try {
      const input = (update ? api.itinerantTeams.update.input : api.itinerantTeams.create.input).parse(req.body);
      const teamId = update ? z.coerce.number().int().positive().safe().parse(req.params.id) : null;
      const {data,error} = await rpc('save_itinerant_composition', {
        p_id: teamId, p_actor: req.user.id,
        p_expected_revision: 'expectedRevision' in input ? input.expectedRevision : null,
        p_value: input,
      });
      if (error) throw error;
      res.status(update ? 200 : 201).json(mapItinerantTeam(data));
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({message:error.errors[0].message});
      const message = String(error?.message ?? '');
      if (message.includes('ITINERANT_CONFLICT')) return res.status(409).json({message:'Otra sesión ha cambiado el equipo. Recarga antes de guardar.'});
      if (message.includes('ITINERANT_FORBIDDEN')) return res.status(403).json({message:'Solo ADMIN puede editar el catálogo.'});
      if (message.includes('ITINERANT_INVALID') || error?.code === '23505') return res.status(400).json({message:'Composición no válida: revisa código, recursos activos y disponibilidad.'});
      res.status(500).json({message:'No se pudo guardar la composición. No se ha guardado ningún cambio.'});
    }
  };
  app.post(api.itinerantTeams.create.path, save(false));
  app.put(api.itinerantTeams.update.path, save(true));
}

/** Only opted-in new days use this authority. Historical local IDs are untouched. */
export function applyDailyItinerantComposition(input: EngineInput, raw: unknown, planId: number): EngineInput {
  const parsed = z.array(dailyItinerantUnitSchema).safeParse(raw);
  if (!parsed.success) throw new ItinerantCompositionError('snapshot diario inválido');
  const units = parsed.data.sort((a,b)=>a.id-b.id);
  const byGlobal = new Map(units.map(unit => [unit.source_team_id,unit]));
  if (byGlobal.size !== units.length || new Set(units.map(unit=>unit.id)).size !== units.length)
    throw new ItinerantCompositionError('correspondencia de unidad ambigua');
  for (const unit of units) {
    if (unit.plan_id !== planId) throw new ItinerantCompositionError('unidad de otra jornada');
    if (new Set(unit.members.map(m=>m.resourceItemId)).size !== unit.members.length || new Set(unit.members.map(m=>m.planResourceItemId)).size !== unit.members.length)
      throw new ItinerantCompositionError('miembro duplicado');
    for (const member of unit.members) {
      const matches = input.planResourceItems.filter(item=>item.resourceItemId === member.resourceItemId);
      if (matches.length !== 1 || matches[0].id !== member.planResourceItemId)
        throw new ItinerantCompositionError('recurso físico sin correspondencia inequívoca');
    }
  }
  const local = (global: number) => {
    const unit = byGlobal.get(global);
    if (!unit) throw new ItinerantCompositionError('equipo global sin correspondencia diaria');
    return unit.id;
  };
  return {...input, itinerantCompositionSnapshot: {contractVersion:1, units}, itinerantTeamAvailability: units.map(unit=>({
    itinerantTeamId:unit.id, windows:(unit.availability_windows ?? [{...input.workDay}]).map(window=>({
      start:window.start < input.workDay.start ? input.workDay.start : window.start,
      end:window.end > input.workDay.end ? input.workDay.end : window.end,
    })).filter(window=>window.start < window.end),
    planResourceItemIds:unit.members.map(m=>m.planResourceItemId).sort((a,b)=>a-b),
    ...(unit.transition_minutes === null ? {} : {transitionMinutes:unit.transition_minutes}),
  })), tasks:input.tasks.map(task=> {
    // plan_breaks.itinerant_team_id is a catalog FK, not a daily unit ID.
    if (task.breakId != null) return {...task,itinerantTeamId:task.itinerantTeamId==null?null:local(task.itinerantTeamId),allowedItinerantTeamIds:[]};
    if (task.itinerantTeamRequirement === 'none') return {...task,itinerantTeamId:null,allowedItinerantTeamIds:[]};
    const allowed = task.allowedItinerantTeamIds ?? [];
    if (task.itinerantTeamRequirement === 'any' && !allowed.length) throw new ItinerantCompositionError('plantilla sin alternativas explícitas');
    if (task.itinerantTeamRequirement === 'specific' && task.itinerantTeamId == null) throw new ItinerantCompositionError('plantilla sin equipo obligatorio');
    if (task.itinerantTeamRequirement === 'specific' && allowed.some(id=>id!==task.itinerantTeamId))
      throw new ItinerantCompositionError('equipo obligatorio incompatible con sus alternativas');
    const independentResources = Object.keys(task.resourceRequirements?.byItem ?? {}).map(Number).map(resourceItemId=>{
      const matches = input.planResourceItems.filter(item=>item.resourceItemId === resourceItemId);
      if (matches.length !== 1) throw new ItinerantCompositionError('requisito físico independiente sin correspondencia inequívoca');
      return matches[0].id;
    });
    return {...task,itinerantTeamId:task.itinerantTeamId == null ? null : local(task.itinerantTeamId),allowedItinerantTeamIds:allowed.map(local),
      ...(independentResources.length ? {declaredResourceIds:[...new Set([...(task.declaredResourceIds??[]),...independentResources])].sort((a,b)=>a-b)} : {})};
  })};
}
