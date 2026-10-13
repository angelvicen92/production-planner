/** Versioned A2 import mapping. Keys are canonical source identities, never
 * display-name inference in product/runtime code. Space identities stay stable. */
export const a2SpatialTopologyV1 = [
  { id: 6001, name: "Alfombra roja", spaces: ["alfombra-roja"] },
  { id: 6002, name: "Caracolas", spaces: ["caracola-jose-maria", "caracola-lucia"] },
  { id: 6004, name: "Estudio 7", spaces: ["estudio-7"] },
  { id: 6005, name: "Plató 14", spaces: ["p14-giratuto", "p14-pasillo", "p14-recursos", "reality-hall-p14"] },
  { id: 6008, name: "Plató 15", spaces: ["p15-croma", "p15-estrellas-sillon"] },
  { id: 6010, name: "Comidas participantes", spaces: ["participant-meal"] },
  { id: 6011, name: "Reality", spaces: ["reality-buggy", "reality-control", "reality-corner-music", "reality-influencer", "reality-manzano", "reality-plato"] },
  { id: 6018, name: "Estilismo", spaces: ["styling"] },
  { id: 6019, name: "Salas Totales", spaces: ["totales-1", "totales-coreo", "totales-post"] },
  { id: 6022, name: "Transporte", spaces: ["transport-in", "transport-out"] },
] as const;

const a2GroupedSpatialTopologyV2 = [...a2SpatialTopologyV1, {id:6024,name:"Maqui/Pelu",spaces:["redes-maqui-pelu"]}] as const;

export function resolveA2SpatialTopology(sourceSpaceIds: readonly string[], offset = 0) {
  const zoneBySource = new Map<string, number>();
  for (const zone of a2GroupedSpatialTopologyV2) for (const sourceId of zone.spaces) {
    if (zoneBySource.has(sourceId)) throw Error(`Duplicate A2 topology identity: ${sourceId}`);
    zoneBySource.set(sourceId, zone.id + offset);
  }
  if (new Set(sourceSpaceIds).size !== sourceSpaceIds.length || sourceSpaceIds.length !== zoneBySource.size
    || sourceSpaceIds.some(id => !zoneBySource.has(id))) throw Error("A2 topology mapping must cover the exact canonical space set");
  return { contractVersion: 2 as const, zoneBySource,
    zones: a2GroupedSpatialTopologyV2.map((zone, index) => ({ id: zone.id + offset, name: zone.name, ui_order_index: index })) };
}

export type A2TopologyDecision = 'REUSE_EXISTING' | 'NEW_EXPLICIT_CHILD' | 'VIRTUAL_NON_PHYSICAL' | 'UNRESOLVED';
export const A2_REAL_TOPOLOGY_VERSION = 2 as const;
/** The original 23 source spaces plus the explicit Redes extension. Aliases
 * collapse before engine input/persistence; no names are inferred at runtime. */
export const a2RealSpatialManifest = [
 ['alfombra-roja',3001,25,11,null,'REUSE_EXISTING','Alfombra',[],1],
 ['caracola-jose-maria',3002,41,13,null,'REUSE_EXISTING','Sala Vocal Jose María',['coach-jose-maria'],1],
 ['caracola-lucia',3003,35,13,null,'REUSE_EXISTING','Sala Vocal Lucía',['coach-lucia'],1],
 ['estudio-7',3004,48,1,null,'REUSE_EXISTING','Plató 7',[],1],
 ['p14-giratuto',3005,32,3,4,'REUSE_EXISTING','Giratutto',[],1],
 ['p14-pasillo',3006,3,3,null,'REUSE_EXISTING','Pasillo',['cam-1'],1],
 ['p14-recursos',3007,31,3,4,'REUSE_EXISTING','Corner',['cam-1'],1],
 ['p15-croma',3008,43,2,42,'REUSE_EXISTING','Croma',['cam-2'],1],
 ['p15-estrellas-sillon',3009,3030,2,42,'NEW_EXPLICIT_CHILD','Estrellas + Sillón',['cam-2'],1],
 ['participant-meal',3010,null,null,null,'VIRTUAL_NON_PHYSICAL','Comida individual',[],null],
 ['reality-buggy',3011,28,11,null,'REUSE_EXISTING','Buggy',[],1],
 ['reality-control',3012,46,11,null,'REUSE_EXISTING','Control',[],1],
 ['reality-corner-music',3013,31,3,4,'REUSE_EXISTING','Corner',['cam-1'],1],
 ['reality-hall-p14',3014,4,3,null,'REUSE_EXISTING','Hall',[],1],
 ['reality-influencer',3015,31,3,4,'REUSE_EXISTING','Corner',['cam-1'],1],
 ['reality-manzano',3016,26,11,null,'REUSE_EXISTING','Manzano',[],1],
 ['reality-plato',3017,3031,14,null,'VIRTUAL_NON_PHYSICAL','Acompañamiento itinerante (virtual)',[],null],
 ['styling',3018,40,14,null,'REUSE_EXISTING','Vestu',[],1],
 ['totales-1',3019,34,12,null,'REUSE_EXISTING','Sala Totales 1',['cam-5'],1],
 ['totales-coreo',3020,33,12,null,'REUSE_EXISTING','Sala Totales Coreo',['cam-6'],1],
 ['totales-post',3021,3032,14,null,'NEW_EXPLICIT_CHILD','Totales Post',[],1],
 ['transport-in',3022,49,14,null,'REUSE_EXISTING','Transporte',[],null],
 ['transport-out',3023,49,14,null,'REUSE_EXISTING','Transporte',[],null],
 ['redes-maqui-pelu',3024,39,14,null,'REUSE_EXISTING','Maqui/Pelu',[],1],
].map(([source,current,target,zone,parent,decision,name,resources,capacity]) => ({
 contractVersion:A2_REAL_TOPOLOGY_VERSION, sourceId:source as string, sourceNumericSpaceId:current as number, currentA2SpaceId:current===3024?null:current as number,
 previousTaskLocationSpaceId:current===3024?3007:null,
 historicalSpaceId:target as number|null, zoneId:zone as number|null,parentSpaceId:parent as number|null,
 decision:decision as A2TopologyDecision, name:name as string, effectiveSpaceResources:resources as string[], capacity:capacity as number|null,
 operationalDependencies:source==='p15-estrellas-sillon'?['one-block-per-family','setup-10-min','no-reentry']:
  source==='reality-plato'?['anchored-before-anchor-after','45-min-logical','15-min-studio-7']:
  source==='transport-in'||source==='transport-out'?['configured-transport-grouping']:
  source==='totales-post'?['joint-C06-C10','after-joint-alfombra','relocatable']:[],
 reason:decision==='REUSE_EXISTING'?'Explicit catalog identity; preserve historical row':
  decision==='VIRTUAL_NON_PHYSICAL'?'No exclusive physical capacity or additional operational meal':
  'New effective identity; preserve historical configurations and days',
 evidence:'Fuente 06 v2.8; production corrections; identity-only catalog GET 2026-10-13',
}));

/** Explicit canonical source → actual product asset, not a runtime name rule. */
export const a2ResourceManifest = [
 ['cam-1',4],['cam-2',5],['cam-3',7],['cam-4',8],['cam-5',6],['cam-6',14],
 ['coach-jose-maria',1],['coach-lucia',2],['eva',3],['son-1',10],['son-2',11],
].map(([sourceId,resourceItemId])=>({contractVersion:2,sourceId:sourceId as string,currentA2ResourceItemId:({'cam-1':7001,'cam-2':7002,'cam-3':7003,'cam-4':7004,'coach-jose-maria':7005,'coach-lucia':7006,eva:7007,'son-1':7008,'son-2':7009} as Record<string,number>)[sourceId as string]??null,resourceItemId:resourceItemId as number,decision:'REUSE_EXISTING' as const,evidence:'Identity-only resource catalog GET 2026-10-13; Fuente 06 v2.8'}));
