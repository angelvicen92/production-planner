import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeleteItinerantTeam, useItinerantTeams } from '@/hooks/use-itinerant-teams';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useUserRole } from '@/hooks/use-user-role';
import { apiRequest } from '@/lib/api';
import { api } from '@shared/routes';
import { itinerantCompositionInput, type ItinerantTeam, type ItinerantCompositionInput } from '@shared/itinerantComposition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { CardContent } from '@/components/ui/card';

const empty: ItinerantCompositionInput = {code:'',name:'',resourceItemIds:[],availabilityWindows:null,transitionMinutes:null,isActive:true,orderIndex:0};
export function ItinerantCompositionSettings() {
  const qc = useQueryClient(); const {role} = useUserRole(); const canEdit = role === 'admin';
  const teams = useItinerantTeams();
  const remove = useDeleteItinerantTeam(); const confirm = useConfirm();
  const resources = useQuery<any[]>({queryKey:['/api/resource-types-with-items'],staleTime:0,refetchOnMount:'always',queryFn:()=>apiRequest('GET','/api/resource-types-with-items'),select:(types:any[])=>types.flatMap(type=>type.items??[])});
  const [editing,setEditing] = useState<ItinerantTeam | null>(null);
  const [form,setForm] = useState<ItinerantCompositionInput>(empty);
  const [validation,setValidation] = useState('');
  const [notice,setNotice] = useState('');
  const rows = (teams.data ?? []) as ItinerantTeam[];
  const selectable = [...(resources.data??[]), ...form.resourceItemIds.filter(id=>!resources.data?.some(resource=>resource.id===id)).map(id=>({id,name:`Recurso ${id} (no disponible)`}))];
  const resourceName = (id: number) => resources.data?.find(r=>r.id === id)?.name ?? `Recurso ${id}`;
  const save = useMutation({mutationFn:()=>apiRequest(editing?'PUT':'POST',editing?api.itinerantTeams.update.path.replace(':id',String(editing.id)):api.itinerantTeams.create.path,
    editing?{...form,expectedRevision:editing.revision}:form),onSuccess:async()=>{
      await qc.invalidateQueries({queryKey:[api.itinerantTeams.list.path]}); setEditing(null);setForm(empty);setValidation('');setNotice('Composición guardada para nuevas jornadas.');
    }});
  const patch = (value: Partial<ItinerantCompositionInput>) => setForm(previous=>({...previous,...value}));
  return <CardContent className="space-y-4" data-testid="itinerant-compositions">
    <p className="text-sm text-muted-foreground">Cada equipo ocupa sus miembros físicos. Si dos composiciones comparten una cámara o un técnico, no podrán utilizarlo a la vez. Guardar aquí se aplica a nuevas jornadas; cada día conserva su snapshot.</p>
    <p className="text-sm text-muted-foreground">La composición no impone agrupación, continuidad ni concentración de presencia. Las disponibilidades y comidas de los miembros se aplican por separado; las reglas de comida de unidad se consultan en cada jornada.</p>
    {teams.isLoading||resources.isLoading?<p>Cargando equipos y recursos…</p>:null}
    {teams.error||resources.error?<p role="alert">No se pudieron leer los equipos o recursos. Recarga para revisar la composición.</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    {remove.error?<p role="alert">{remove.error.message}</p>:null}
    {canEdit?<form className="space-y-3 rounded-md border p-3" onSubmit={event=>{event.preventDefault();setNotice('');const checked=itinerantCompositionInput.safeParse(form);if(!checked.success){setValidation(checked.error.errors[0].message);return;}setValidation('');save.mutate();}}>
      <h3 className="font-medium">{editing?'Editar equipo':'Crear equipo'}</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <label>Código estable<Input aria-label="Código de equipo" value={form.code} disabled={!!editing||save.isPending} onChange={e=>patch({code:e.target.value})}/></label>
        <label>Nombre<Input aria-label="Nombre de equipo" value={form.name} disabled={save.isPending} onChange={e=>patch({name:e.target.value})}/></label>
      </div>
      <fieldset disabled={save.isPending||!!resources.error}><legend>Recursos físicos integrantes</legend><div className="grid max-h-64 gap-2 overflow-y-auto py-2 md:grid-cols-3">
        {selectable.filter(r=>(r.isActive??r.is_active)!==false||form.resourceItemIds.includes(r.id)).map(resource=><label key={resource.id} className="flex items-center gap-2 text-sm">
          <Checkbox aria-label={`Integrante ${resource.name}`} checked={form.resourceItemIds.includes(resource.id)} onCheckedChange={checked=>patch({resourceItemIds:checked?[...form.resourceItemIds,resource.id]:form.resourceItemIds.filter(id=>id!==resource.id)})}/>{resource.name}
        </label>)}
      </div></fieldset>
      <label className="flex items-center gap-2"><Checkbox aria-label="Disponibilidad propia del equipo" checked={form.availabilityWindows!==null} onCheckedChange={checked=>patch({availabilityWindows:checked?[{start:'09:00',end:'21:00'}]:null})}/>Disponibilidad habitual explícita</label>
      {form.availabilityWindows===null?<p className="text-sm text-muted-foreground">Sin restricción adicional: se aplican la jornada y las disponibilidades de sus miembros.</p>:<div className="space-y-2">{form.availabilityWindows.map((window,index)=><div className="flex gap-2" key={index}>
        <label>Desde<Input type="time" aria-label={`Disponible desde ${index+1}`} value={window.start} onChange={e=>patch({availabilityWindows:form.availabilityWindows!.map((w,i)=>i===index?{...w,start:e.target.value}:w)})}/></label>
        <label>Hasta<Input type="time" aria-label={`Disponible hasta ${index+1}`} value={window.end} onChange={e=>patch({availabilityWindows:form.availabilityWindows!.map((w,i)=>i===index?{...w,end:e.target.value}:w)})}/></label>
        <Button type="button" variant="outline" disabled={form.availabilityWindows!.length===1} onClick={()=>patch({availabilityWindows:form.availabilityWindows!.filter((_,i)=>i!==index)})}>Quitar ventana</Button>
      </div>)}<Button type="button" variant="outline" onClick={()=>patch({availabilityWindows:[...form.availabilityWindows!,{start:'09:00',end:'21:00'}]})}>Añadir ventana</Button></div>}
      <label>Transición entre espacios (minutos)<Input type="number" min={0} max={1440} aria-label="Transición del equipo" value={form.transitionMinutes??''} placeholder="Sin transición adicional" onChange={e=>patch({transitionMinutes:e.target.value===''?null:Number(e.target.value)})}/></label>
      <label className="flex items-center gap-2"><Checkbox aria-label="Equipo activo" checked={form.isActive} onCheckedChange={checked=>patch({isActive:checked===true})}/>Activo para nuevas jornadas</label>
      {validation?<p role="alert">{validation}</p>:null}{save.error?<p role="alert">{save.error.message}</p>:null}
      <div className="flex gap-2"><Button type="submit" disabled={save.isPending||teams.isLoading||resources.isLoading||!!resources.error||!!teams.error}>{save.isPending?'Guardando…':editing?'Guardar composición':'Crear composición'}</Button>
        {editing?<Button type="button" variant="outline" onClick={()=>{setEditing(null);setForm(empty);save.reset();}}>Cancelar edición</Button>:null}
        <Button type="button" variant="outline" onClick={async()=>{await Promise.all([teams.refetch(),resources.refetch()]);setEditing(null);setForm(empty);save.reset();}}>Recargar</Button></div>
    </form>:<p className="text-sm">Tu perfil permite consultar. Solo Administración puede editar el catálogo.</p>}
    <div className="space-y-3">{rows.map(team=><article key={team.id} data-testid="itinerant-composition" data-team-id={team.id} className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2"><h3 className="font-medium">{team.name} · {team.code}{team.isActive?'':' · Inactivo'}</h3>{canEdit?<Button variant="outline" size="sm" onClick={()=>{setEditing(team);setForm({code:team.code,name:team.name,resourceItemIds:team.resourceItemIds,availabilityWindows:team.availabilityWindows,transitionMinutes:team.transitionMinutes,isActive:team.isActive,orderIndex:team.orderIndex});save.reset();setValidation('');}}>Editar {team.name}</Button>:null}</div>
      <p className="text-sm">Miembros: {team.resourceItemIds.length?team.resourceItemIds.map(resourceName).join(' + '):'Sin composición física. Completar antes de usar en nuevas jornadas.'}</p>
      <p className="text-sm">Disponibilidad: {team.availabilityWindows?.map(w=>`${w.start}–${w.end}`).join(', ')??'Jornada y miembros'} · Transición: {team.transitionMinutes==null?'sin restricción adicional':`${team.transitionMinutes} min`}</p>
      {canEdit?<Button size="sm" variant="outline" disabled={remove.isPending||save.isPending} onClick={async()=>{
        if(await confirm({title:'Eliminar equipo',description:`¿Eliminar ${team.name}? Los equipos referenciados se conservan; puedes desactivarlos para nuevas jornadas.`,confirmText:'Eliminar'}))remove.mutate(team.id);
      }}>Eliminar</Button>:null}
      {rows.filter(other=>other.id!==team.id&&other.resourceItemIds.some(id=>team.resourceItemIds.includes(id))).map(other=><p key={other.id} className="text-sm text-amber-700 dark:text-amber-400">Comparte {team.resourceItemIds.filter(id=>other.resourceItemIds.includes(id)).map(resourceName).join(', ')} con {other.name}. Su capacidad física no puede utilizarse simultáneamente.</p>)}
    </article>)}</div>
  </CardContent>;
}
