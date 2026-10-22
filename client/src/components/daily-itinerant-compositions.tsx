import type { EngineInput } from '../../../engine/types';

export function DailyItinerantCompositions({units,resources,labels,presencePolicies}:{units:NonNullable<EngineInput['itinerantTeamAvailability']>;resources:{id:number;name:string}[];labels?:{id:number;name:string}[];presencePolicies?:Record<number,'OFF'|'PREFERRED'|'REQUIRED'>}) {
  if (!units.length) return <p>No hay unidades itinerantes configuradas en esta jornada.</p>;
  const name = (id:number)=>resources.find(resource=>resource.id===id)?.name??`Recurso ${id}`;
  return <section data-testid="daily-itinerant-compositions" className="space-y-3 rounded-md border p-3">
    <h3 className="font-medium">Composición efectiva de equipos itinerantes</h3>
    <p className="text-sm text-muted-foreground">Estas unidades pertenecen al snapshot de esta jornada. Compartir un miembro impide utilizarlo simultáneamente. Sus comidas y disponibilidades individuales también restringen la capacidad; la composición no crea continuidad, setups ni concentración de presencia.</p>
    {units.map(unit=><div key={unit.itinerantTeamId} className="text-sm">
      <p className="font-medium">{labels?.find(label=>label.id===unit.itinerantTeamId)?.name??`Unidad diaria ${unit.itinerantTeamId}`}: {(unit.planResourceItemIds??[]).map(name).join(' + ')||'Composición local sin miembros declarados'}</p>
      <p>{unit.windows.map(window=>`${window.start}–${window.end}`).join(', ')} · Transición: {unit.transitionMinutes==null?'heredada de la política efectiva':`${unit.transitionMinutes} min`}</p>
      {(unit.planResourceItemIds??[]).filter(id=>presencePolicies?.[id]&&presencePolicies[id]!=='OFF').map(id=><p key={id}>{name(id)} · Concentración {presencePolicies![id]}: {presencePolicies![id]==='REQUIRED'?'exige un bloque operativo en propuestas automáticas, con las pausas autorizadas configuradas':'intenta reducir bloques, presencia y huecos'}. Esta política es independiente de la composición.</p>)}
      {units.filter(other=>other.itinerantTeamId!==unit.itinerantTeamId&&other.planResourceItemIds?.some(id=>unit.planResourceItemIds?.includes(id))).map(other=><p key={other.itinerantTeamId} className="text-amber-700 dark:text-amber-400">Comparte {(unit.planResourceItemIds??[]).filter(id=>other.planResourceItemIds?.includes(id)).map(name).join(', ')} con unidad {other.itinerantTeamId}.</p>)}
    </div>)}
  </section>;
}
