import type { CanonicalFullA2Template, CanonicalItinerantOperation, CanonicalItinerantUnit, CanonicalParticipantAssignment, CanonicalResource, CanonicalSpace, CanonicalTaskTypeDefinition, TaskType } from "./types";
import { CONTRACT_VERSION, PARTICIPANT_IDS } from "./types";
import { A2_BENCHMARK_SOURCE_CONFIGURATION } from "./benchmarkConfiguration";

export const EXPECTED_COUNTS_BY_TYPE: Readonly<Record<TaskType, number>> = Object.freeze({
  CROMA: 19,
  ENSAYO_ESTUDIO_7: 19,
  ESTILISMO_ENTRADA: 19,
  ESTILISMO_SALIDA: 19,
  IN: 19,
  OUT: 19,
  PASILLO: 19,
  SODEXO: 19,
  REDES: 18,
  PRUEBA_VOCAL_JOSE_MARIA: 11,
  CORNER_INFLUENCER: 10,
  TOTALES_1: 10,
  SILLON: 9,
  TOTALES_COREO: 9,
  ESTRELLAS: 8,
  PRUEBA_VOCAL_LUCIA: 8,
  GIRATUTO: 7,
  REALITY_PLATO_ANTES: 3,
  REALITY_PLATO_DESPUES: 3,
  ALFOMBRA_ROJA_CONJUNTA: 2,
  ALFOMBRA_ROJA_EVA: 2,
  CORNER_INFLUENCER_MUSIC: 2,
  CORNER_MUSIC: 2,
  REALITY_HALL: 2,
  TOTALES_POST_CONJUNTO: 2,
  ALFOMBRA_ROJA: 1,
  REALITY_BUGGY: 1,
  REALITY_CONTROL_EVA: 1,
  REALITY_CORNER_MUSIC: 1,
  REALITY_INFLUENCER: 1,
  REALITY_MANZANO: 1,
  TECH_DESMONTAJE_TRASLADO: 1,
  TECH_REALITY_EVA: 1,
  TECH_TOTALES_POST: 1,
});

export const EXPECTED_PARTICIPANT_TASK_MATRIX: Readonly<Record<string, readonly TaskType[]>> = Object.freeze({
  C01: ["IN", "ESTILISMO_ENTRADA", "CROMA", "PRUEBA_VOCAL_LUCIA", "REALITY_PLATO_ANTES", "ENSAYO_ESTUDIO_7", "REALITY_PLATO_DESPUES", "REDES", "PASILLO", "TOTALES_1", "SODEXO", "GIRATUTO", "ESTILISMO_SALIDA", "OUT"],
  C02: ["IN", "ESTILISMO_ENTRADA", "CROMA", "CORNER_INFLUENCER", "PRUEBA_VOCAL_LUCIA", "ENSAYO_ESTUDIO_7", "REDES", "PASILLO", "TOTALES_COREO", "SILLON", "SODEXO", "ESTRELLAS", "ESTILISMO_SALIDA", "OUT"],
  C03: ["IN", "ESTILISMO_ENTRADA", "CROMA", "PRUEBA_VOCAL_LUCIA", "TOTALES_1", "CORNER_INFLUENCER_MUSIC", "ENSAYO_ESTUDIO_7", "REDES", "PASILLO", "SODEXO", "ESTILISMO_SALIDA", "OUT"],
  C04: ["IN", "PRUEBA_VOCAL_LUCIA", "ESTILISMO_ENTRADA", "CROMA", "TOTALES_COREO", "ENSAYO_ESTUDIO_7", "PASILLO", "REDES", "SODEXO", "GIRATUTO", "ALFOMBRA_ROJA_EVA", "ESTILISMO_SALIDA", "OUT"],
  C05: ["IN", "ESTILISMO_ENTRADA", "PRUEBA_VOCAL_JOSE_MARIA", "CROMA", "CORNER_MUSIC", "REALITY_PLATO_ANTES", "ENSAYO_ESTUDIO_7", "REALITY_PLATO_DESPUES", "TOTALES_1", "PASILLO", "SILLON", "SODEXO", "ESTRELLAS", "ESTILISMO_SALIDA", "OUT"],
  C06: ["IN", "ESTILISMO_ENTRADA", "CORNER_MUSIC", "CROMA", "PRUEBA_VOCAL_JOSE_MARIA", "PASILLO", "REDES", "ENSAYO_ESTUDIO_7", "TOTALES_COREO", "SODEXO", "ESTRELLAS", "GIRATUTO", "REALITY_HALL", "ALFOMBRA_ROJA_CONJUNTA", "TOTALES_POST_CONJUNTO", "ESTILISMO_SALIDA", "OUT"],
  C07: ["IN", "ESTILISMO_ENTRADA", "CORNER_INFLUENCER", "CROMA", "PRUEBA_VOCAL_JOSE_MARIA", "TOTALES_1", "PASILLO", "REDES", "ENSAYO_ESTUDIO_7", "SILLON", "SODEXO", "ESTRELLAS", "ESTILISMO_SALIDA", "OUT"],
  C08: ["IN", "ESTILISMO_ENTRADA", "PRUEBA_VOCAL_JOSE_MARIA", "CROMA", "CORNER_INFLUENCER_MUSIC", "TOTALES_COREO", "PASILLO", "REDES", "REALITY_PLATO_ANTES", "ENSAYO_ESTUDIO_7", "REALITY_PLATO_DESPUES", "SODEXO", "ESTILISMO_SALIDA", "OUT"],
  C09: ["IN", "PRUEBA_VOCAL_JOSE_MARIA", "ESTILISMO_ENTRADA", "CROMA", "CORNER_INFLUENCER", "REALITY_INFLUENCER", "PASILLO", "REDES", "ENSAYO_ESTUDIO_7", "SILLON", "SODEXO", "ESTRELLAS", "TOTALES_1", "ESTILISMO_SALIDA", "OUT"],
  C10: ["IN", "PRUEBA_VOCAL_JOSE_MARIA", "ESTILISMO_ENTRADA", "REALITY_MANZANO", "CROMA", "PASILLO", "REDES", "ENSAYO_ESTUDIO_7", "SILLON", "ESTRELLAS", "SODEXO", "TOTALES_COREO", "ALFOMBRA_ROJA_CONJUNTA", "TOTALES_POST_CONJUNTO", "ESTILISMO_SALIDA", "OUT"],
  C11: ["IN", "PRUEBA_VOCAL_JOSE_MARIA", "ESTILISMO_ENTRADA", "CROMA", "CORNER_INFLUENCER", "PASILLO", "REDES", "ENSAYO_ESTUDIO_7", "SILLON", "SODEXO", "TOTALES_1", "REALITY_BUGGY", "ESTILISMO_SALIDA", "OUT"],
  C12: ["IN", "ESTILISMO_ENTRADA", "CROMA", "PASILLO", "REDES", "PRUEBA_VOCAL_LUCIA", "SODEXO", "GIRATUTO", "ENSAYO_ESTUDIO_7", "TOTALES_1", "CORNER_INFLUENCER", "REALITY_CONTROL_EVA", "ESTILISMO_SALIDA", "OUT"],
  C13: ["IN", "ESTILISMO_ENTRADA", "TOTALES_1", "CROMA", "PASILLO", "REDES", "SILLON", "PRUEBA_VOCAL_LUCIA", "SODEXO", "GIRATUTO", "ESTRELLAS", "ENSAYO_ESTUDIO_7", "ALFOMBRA_ROJA_EVA", "ESTILISMO_SALIDA", "OUT"],
  C14: ["IN", "ESTILISMO_ENTRADA", "TOTALES_COREO", "CROMA", "PASILLO", "REDES", "SODEXO", "PRUEBA_VOCAL_LUCIA", "GIRATUTO", "ENSAYO_ESTUDIO_7", "CORNER_INFLUENCER", "ESTILISMO_SALIDA", "OUT"],
  C15: ["IN", "ESTILISMO_ENTRADA", "CROMA", "PASILLO", "REDES", "TOTALES_1", "CORNER_INFLUENCER", "SILLON", "PRUEBA_VOCAL_LUCIA", "GIRATUTO", "SODEXO", "ENSAYO_ESTUDIO_7", "ESTILISMO_SALIDA", "OUT"],
  C16: ["IN", "ESTILISMO_ENTRADA", "CROMA", "PASILLO", "REDES", "TOTALES_COREO", "CORNER_INFLUENCER", "SODEXO", "PRUEBA_VOCAL_JOSE_MARIA", "ENSAYO_ESTUDIO_7", "ALFOMBRA_ROJA", "ESTILISMO_SALIDA", "OUT"],
  C17: ["IN", "ESTILISMO_ENTRADA", "CROMA", "REALITY_HALL", "PASILLO", "REDES", "ESTRELLAS", "SODEXO", "PRUEBA_VOCAL_JOSE_MARIA", "ENSAYO_ESTUDIO_7", "TOTALES_1", "ESTILISMO_SALIDA", "OUT"],
  C18: ["IN", "ESTILISMO_ENTRADA", "CROMA", "PASILLO", "REDES", "SILLON", "SODEXO", "CORNER_INFLUENCER", "PRUEBA_VOCAL_JOSE_MARIA", "TOTALES_COREO", "ENSAYO_ESTUDIO_7", "ESTILISMO_SALIDA", "OUT"],
  C19: ["IN", "ESTILISMO_ENTRADA", "CROMA", "PASILLO", "REDES", "REALITY_CORNER_MUSIC", "CORNER_INFLUENCER", "PRUEBA_VOCAL_JOSE_MARIA", "TOTALES_COREO", "SODEXO", "ENSAYO_ESTUDIO_7", "ESTILISMO_SALIDA", "OUT"],
});

export const EXPECTED_COACH_BY_PARTICIPANT: Readonly<Record<string, "coach-lucia" | "coach-jose-maria">> = Object.freeze({
  C01: "coach-lucia",
  C02: "coach-lucia",
  C03: "coach-lucia",
  C04: "coach-lucia",
  C05: "coach-jose-maria",
  C06: "coach-jose-maria",
  C07: "coach-jose-maria",
  C08: "coach-jose-maria",
  C09: "coach-jose-maria",
  C10: "coach-jose-maria",
  C11: "coach-jose-maria",
  C12: "coach-lucia",
  C13: "coach-lucia",
  C14: "coach-lucia",
  C15: "coach-lucia",
  C16: "coach-jose-maria",
  C17: "coach-jose-maria",
  C18: "coach-jose-maria",
  C19: "coach-jose-maria",
});

export const TASK_TYPES: Readonly<Record<TaskType, CanonicalTaskTypeDefinition>> = Object.freeze({
  IN: { label: "IN", duration: 5, spaceId: "transport-in", operationalKind: "transport_arrival", exclusiveSpaceUse: "not_applicable", knownResourceIds: [], blocksParticipant: true },
  ESTILISMO_ENTRADA: { label: "Estilismo entrada", duration: 10, spaceId: "styling", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  CROMA: { label: "Croma", duration: 10, spaceId: "p15-croma", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: ["cam-2"], blocksParticipant: true },
  PRUEBA_VOCAL_LUCIA: { label: "Prueba vocal - Lucía", duration: 15, spaceId: "caracola-lucia", operationalKind: "vocal", exclusiveSpaceUse: true, knownResourceIds: ["coach-lucia"], blocksParticipant: true },
  PRUEBA_VOCAL_JOSE_MARIA: { label: "Prueba vocal - José María", duration: 15, spaceId: "caracola-jose-maria", operationalKind: "vocal", exclusiveSpaceUse: true, knownResourceIds: ["coach-jose-maria"], blocksParticipant: true },
  ENSAYO_ESTUDIO_7: { label: "Ensayo vocal - Estudio 7", duration: 15, spaceId: "estudio-7", operationalKind: "main", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true, countsForMainFlow: true },
  REDES: { label: "Redes", duration: 5, spaceId: "p14-recursos", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  PASILLO: { label: "Pasillo", duration: 5, spaceId: "p14-pasillo", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  TOTALES_1: { label: "Totales 1", duration: 30, spaceId: "totales-1", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  TOTALES_COREO: { label: "Totales Coreo", duration: 30, spaceId: "totales-coreo", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  SODEXO: { label: "Sodexo", duration: 40, spaceId: "participant-meal", operationalKind: "participant_meal", exclusiveSpaceUse: false, knownResourceIds: [], blocksParticipant: true },
  GIRATUTO: { label: "Giratuto", duration: 5, spaceId: "p14-giratuto", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  SILLON: { label: "Sillón", duration: 5, spaceId: "p15-estrellas-sillon", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  ESTRELLAS: { label: "Estrellas", duration: 5, spaceId: "p15-estrellas-sillon", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  CORNER_INFLUENCER: { label: "Corner Influencer", duration: 10, spaceId: "p14-recursos", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  CORNER_MUSIC: { label: "Corner Music", duration: 10, spaceId: "p14-recursos", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  CORNER_INFLUENCER_MUSIC: { label: "Corner Influencer + Music", duration: 15, spaceId: "p14-recursos", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  REALITY_PLATO_ANTES: { label: "Reality Plató - antes", duration: 15, spaceId: "reality-plato", operationalKind: "anchored_segment", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  REALITY_PLATO_DESPUES: { label: "Reality Plató - después", duration: 15, spaceId: "reality-plato", operationalKind: "anchored_segment", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  REALITY_HALL: { label: "Reality Hall", duration: 30, spaceId: "reality-hall-p14", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  REALITY_INFLUENCER: { label: "Reality Influencer", duration: 30, spaceId: "reality-influencer", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  REALITY_MANZANO: { label: "Reality Manzano", duration: 30, spaceId: "reality-manzano", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  REALITY_BUGGY: { label: "Reality Buggy", duration: 30, spaceId: "reality-buggy", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  REALITY_CONTROL_EVA: { label: "Reality Control con EVA", duration: 30, spaceId: "reality-control", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: ["eva"], blocksParticipant: true },
  REALITY_CORNER_MUSIC: { label: "Reality Corner Music", duration: 30, spaceId: "reality-corner-music", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  ALFOMBRA_ROJA: { label: "Alfombra Roja", duration: 10, spaceId: "alfombra-roja", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  ALFOMBRA_ROJA_EVA: { label: "Alfombra Roja con EVA", duration: 15, spaceId: "alfombra-roja", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: ["eva"], blocksParticipant: true },
  ALFOMBRA_ROJA_CONJUNTA: { label: "Alfombra Roja conjunta", duration: 10, spaceId: "alfombra-roja", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  TOTALES_POST_CONJUNTO: { label: "Totales Post conjunto", duration: 5, spaceId: "totales-post", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  ESTILISMO_SALIDA: { label: "Estilismo salida", duration: 5, spaceId: "styling", operationalKind: "auxiliary", exclusiveSpaceUse: true, knownResourceIds: [], blocksParticipant: true },
  OUT: { label: "OUT", duration: 5, spaceId: "transport-out", operationalKind: "transport_departure", exclusiveSpaceUse: "not_applicable", knownResourceIds: [], blocksParticipant: true },
  TECH_REALITY_EVA: { label: "Reality con EVA", duration: 20, spaceId: "reality-control", operationalKind: "technical", exclusiveSpaceUse: true, knownResourceIds: ["cam-3", "cam-4", "son-1", "eva"], blocksParticipant: false },
  TECH_DESMONTAJE_TRASLADO: { label: "Desmontaje y traslado", duration: 5, spaceId: "technical-transfer", operationalKind: "technical", exclusiveSpaceUse: true, knownResourceIds: ["cam-3", "cam-4", "son-1", "eva"], blocksParticipant: false },
  TECH_TOTALES_POST: { label: "Totales Post técnico", duration: 5, spaceId: "totales-post", operationalKind: "technical", exclusiveSpaceUse: true, knownResourceIds: ["cam-3", "cam-4", "son-1", "eva"], blocksParticipant: false },
});

export const CANONICAL_SPACES: readonly CanonicalSpace[] = Object.freeze([
  { id: "transport-in", label: "Transporte / acceso", exclusivity: "configuration_required" },
  { id: "transport-out", label: "Transporte / salida", exclusivity: "configuration_required" },
  { id: "styling", label: "Estilismo", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "p15-croma", label: "Plató 15 - Croma", exclusivity: "exclusive", capacityKnown: 1, notes: ["cam-2", "without-sound"] },
  { id: "caracola-lucia", label: "Caracola Vocal Coach - Lucía", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "caracola-jose-maria", label: "Caracola Vocal Coach - José María", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "estudio-7", label: "Estudio 7 / Plató principal", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "p14-recursos", label: "Plató 14 - Recursos", exclusivity: "exclusive", capacityKnown: 1, notes: ["corner-no-setup"] },
  { id: "p14-pasillo", label: "Plató 14 - Pasillo", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "totales-1", label: "Sala Totales 1", exclusivity: "independent", capacityKnown: 1 },
  { id: "totales-coreo", label: "Sala Totales Coreo", exclusivity: "independent", capacityKnown: 1 },
  { id: "participant-meal", label: "Comida individual", exclusivity: "non_blocking" },
  { id: "p14-giratuto", label: "Plató 14 - Giratuto", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "p15-estrellas-sillon", label: "Plató 15 - Estrellas + Sillón", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "reality-plato", label: "Localización Reality Plató", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "reality-hall-p14", label: "Reality - Hall Plató 14", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "reality-influencer", label: "Reality - Corner Influencer", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "reality-manzano", label: "Reality - Manzano", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "reality-buggy", label: "Reality - Buggy", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "reality-control", label: "Reality - Control", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "reality-corner-music", label: "Reality - Corner Music", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "alfombra-roja", label: "Alfombra Roja", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "totales-post", label: "Totales Post", exclusivity: "exclusive", capacityKnown: 1 },
  { id: "technical-transfer", label: "Desmontaje y traslado", exclusivity: "exclusive", capacityKnown: 1 },
]);

export const CANONICAL_RESOURCES: readonly CanonicalResource[] = Object.freeze([
  { id: "cam-2", label: "CAM 2", kind: "camera", availability: "inherits_day_unless_overridden" },
  { id: "cam-3", label: "CAM 3", kind: "camera", availability: "inherits_day_unless_overridden" },
  { id: "cam-4", label: "CAM 4", kind: "camera", availability: "inherits_day_unless_overridden" },
  { id: "son-1", label: "SON 1", kind: "sound", availability: "inherits_day_unless_overridden" },
  { id: "son-2", label: "SON 2", kind: "sound", availability: "inherits_day_unless_overridden" },
  { id: "eva", label: "EVA", kind: "presenter", availability: "inherits_day_unless_overridden" },
  { id: "coach-lucia", label: "Coach Lucía", kind: "coach", availability: "inherits_day_unless_overridden" },
  { id: "coach-jose-maria", label: "Coach José María", kind: "coach", availability: "inherits_day_unless_overridden" },
]);


export const CANONICAL_ITINERANT_UNITS: readonly CanonicalItinerantUnit[] = Object.freeze([
  { id: "reality-unit-a", label: "Unidad Reality A", memberResourceIds: ["cam-3", "son-1"], availability: "creation_input_required" },
  { id: "reality-unit-b", label: "Unidad Reality B", memberResourceIds: ["cam-4", "son-2"], availability: "creation_input_required" },
  { id: "reality-unit-combined", label: "Unidad Reality combinada", memberResourceIds: ["cam-3", "cam-4", "son-1"], availability: "creation_input_required" },
]);

export const CANONICAL_ITINERANT_OPERATIONS: readonly CanonicalItinerantOperation[] = Object.freeze([
  { id: "itinerant.reality-unit-a.C01.reality-plato", itinerantUnitId: "reality-unit-a", participantId: "C01", taskIds: ["C01.reality_plato_antes", "C01.ensayo_estudio_7", "C01.reality_plato_despues"], kind: "anchored", memberResourceIds: ["cam-3", "son-1"] },
  { id: "itinerant.reality-unit-a.C09.reality-influencer", itinerantUnitId: "reality-unit-a", participantId: "C09", taskIds: ["C09.reality_influencer"], kind: "standalone", memberResourceIds: ["cam-3", "son-1"] },
  { id: "itinerant.reality-unit-a.C08.reality-plato", itinerantUnitId: "reality-unit-a", participantId: "C08", taskIds: ["C08.reality_plato_antes", "C08.ensayo_estudio_7", "C08.reality_plato_despues"], kind: "anchored", memberResourceIds: ["cam-3", "son-1"] },
  { id: "itinerant.reality-unit-a.C19.reality-corner-music", itinerantUnitId: "reality-unit-a", participantId: "C19", taskIds: ["C19.reality_corner_music"], kind: "standalone", memberResourceIds: ["cam-3", "son-1"] },
  { id: "itinerant.reality-unit-b.C10.reality-manzano", itinerantUnitId: "reality-unit-b", participantId: "C10", taskIds: ["C10.reality_manzano"], kind: "standalone", memberResourceIds: ["cam-4", "son-2"] },
  { id: "itinerant.reality-unit-b.C05.reality-plato", itinerantUnitId: "reality-unit-b", participantId: "C05", taskIds: ["C05.reality_plato_antes", "C05.ensayo_estudio_7", "C05.reality_plato_despues"], kind: "anchored", memberResourceIds: ["cam-4", "son-2"] },
  { id: "itinerant.reality-unit-b.C17.reality-hall", itinerantUnitId: "reality-unit-b", participantId: "C17", taskIds: ["C17.reality_hall"], kind: "standalone", memberResourceIds: ["cam-4", "son-2"] },
  { id: "itinerant.reality-unit-combined.C06.reality-hall", itinerantUnitId: "reality-unit-combined", participantId: "C06", taskIds: ["C06.reality_hall"], kind: "standalone", memberResourceIds: ["cam-3", "cam-4", "son-1"] },
  { id: "itinerant.reality-unit-combined.C12.reality-control-eva", itinerantUnitId: "reality-unit-combined", participantId: "C12", taskIds: ["C12.reality_control_eva"], kind: "standalone", memberResourceIds: ["cam-3", "cam-4", "son-1"] },
  { id: "itinerant.reality-unit-combined.C11.reality-buggy", itinerantUnitId: "reality-unit-combined", participantId: "C11", taskIds: ["C11.reality_buggy"], kind: "standalone", memberResourceIds: ["cam-3", "cam-4", "son-1"] },
  { id: "itinerant.reality-unit-combined.C04.alfombra-roja-eva", itinerantUnitId: "reality-unit-combined", participantId: "C04", taskIds: ["C04.alfombra_roja_eva"], kind: "standalone", memberResourceIds: ["cam-3", "cam-4", "son-1"] },
  { id: "itinerant.reality-unit-combined.C13.alfombra-roja-eva", itinerantUnitId: "reality-unit-combined", participantId: "C13", taskIds: ["C13.alfombra_roja_eva"], kind: "standalone", memberResourceIds: ["cam-3", "cam-4", "son-1"] },
]);

function assignment(participantId: string): CanonicalParticipantAssignment {
  const sequence = EXPECTED_PARTICIPANT_TASK_MATRIX[participantId] ?? [];
  return {
    participantId: participantId as CanonicalParticipantAssignment["participantId"],
    coachId: EXPECTED_COACH_BY_PARTICIPANT[participantId],
    totales: sequence.includes("TOTALES_1") ? "TOTALES_1" : "TOTALES_COREO",
    corner: sequence.filter((type) => type.startsWith("CORNER_")),
    setup: sequence.filter((type) => type === "SILLON" || type === "ESTRELLAS"),
    extras: sequence.filter((type) => !["IN", "ESTILISMO_ENTRADA", "CROMA", "PRUEBA_VOCAL_LUCIA", "PRUEBA_VOCAL_JOSE_MARIA", "ENSAYO_ESTUDIO_7", "REDES", "PASILLO", "TOTALES_1", "TOTALES_COREO", "SODEXO", "ESTILISMO_SALIDA", "OUT"].includes(type) && !type.startsWith("CORNER_") && type !== "SILLON" && type !== "ESTRELLAS"),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

export function createCanonicalFullA2Template(): CanonicalFullA2Template {
  return deepFreeze({
    contractVersion: CONTRACT_VERSION,
    participants: [...PARTICIPANT_IDS],
    taskTypes: TASK_TYPES,
    spaces: CANONICAL_SPACES,
    resources: CANONICAL_RESOURCES,
    itinerantUnits: CANONICAL_ITINERANT_UNITS,
    itinerantOperations: CANONICAL_ITINERANT_OPERATIONS,
    assignments: PARTICIPANT_IDS.map(assignment),
    requiredCreationInputs: A2_BENCHMARK_SOURCE_CONFIGURATION.unresolvedCreationInputs,
    rules: {
      noSeedSchedule: true,
      noLocks: true,
      mainFlow: {
        spaceId: "estudio-7",
        continuity: "REQUIRED",
        maxBlocksPerCoach: 2,
        blockKey: "coach",
        optimizationAfterFeasibility: "minimize_coach_blocks",
      },
      setup: {
        spaceId: "p15-estrellas-sillon",
        families: ["sillon", "estrellas"],
        oneBlockPerFamily: true,
        orderConstraint: "UNSPECIFIED",
        reentry: "FORBIDDEN",
        preparationMinutesBetweenFamilies: 10,
      },
      cornerSetupPolicy: {
        taskTypes: ["CORNER_INFLUENCER", "CORNER_MUSIC", "CORNER_INFLUENCER_MUSIC"],
        setupRequired: false,
        mandatoryGrouping: false,
      },
      totalesSynchronization: {
        taskTypes: ["TOTALES_1", "TOTALES_COREO"],
        synchronizedRounds: true,
        microphoneChangeMinutesBetweenRounds: 5,
        modelAsSpacePreparationOrTransition: true,
      },
      coachTransition: {
        from: "caracola",
        to: "estudio-7",
        minutes: 30,
        scope: "coach",
      },
      inTransport: {
        minParticipantsPerGroup: 3,
        minMinutesBetweenGroups: 30,
      },
      outTransport: "creation_input_required",
      ignoredEditorialNotes: ["NO_P15", "instrument", "wardrobe", "prop"],
    },
  });
}
