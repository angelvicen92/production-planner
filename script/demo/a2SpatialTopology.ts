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

export function resolveA2SpatialTopology(sourceSpaceIds: readonly string[], offset = 0) {
  const zoneBySource = new Map<string, number>();
  for (const zone of a2SpatialTopologyV1) for (const sourceId of zone.spaces) {
    if (zoneBySource.has(sourceId)) throw Error(`Duplicate A2 topology identity: ${sourceId}`);
    zoneBySource.set(sourceId, zone.id + offset);
  }
  if (new Set(sourceSpaceIds).size !== sourceSpaceIds.length || sourceSpaceIds.length !== zoneBySource.size
    || sourceSpaceIds.some(id => !zoneBySource.has(id))) throw Error("A2 topology mapping must cover the exact canonical space set");
  return { contractVersion: 1 as const, zoneBySource,
    zones: a2SpatialTopologyV1.map((zone, index) => ({ id: zone.id + offset, name: zone.name, ui_order_index: index })) };
}
