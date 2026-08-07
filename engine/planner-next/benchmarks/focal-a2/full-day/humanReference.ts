import { createHash } from "node:crypto";
import { createCanonicalFullA2Template } from "./manifest";
import { expandCanonicalFullA2Template, taskId } from "./expand";
import type { CanonicalTask, ExpandedCanonicalFullA2Template, ParticipantId, TaskType } from "./types";

export const HUMAN_A2_REFERENCE_CONTRACT_VERSION = "A2.human-reference.v1" as const;

export interface HumanA2ReferenceInterval {
  readonly taskId: string;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export interface HumanA2ReferencePreparation {
  readonly id: string;
  readonly kind: "setup_preparation" | "round_preparation";
  readonly spaceId: string;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export interface HumanA2Reference {
  readonly contractVersion: typeof HUMAN_A2_REFERENCE_CONTRACT_VERSION;
  readonly corpusDate: "2025-06-15";
  readonly referenceOnly: true;
  readonly forbiddenAsPlannerInput: true;
  readonly sourceDocuments: readonly [
    "ENSAYO_A2_LV.pdf",
    "ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf",
    "DOCUMENTO_MAESTRO_INTERPRETACION_ENSAYO_A2_v1.md",
  ];
  readonly appliedCorrections: readonly string[];
  readonly sourceAudit: {
    readonly status: "REQUIRES_CONFIGURATION_CLARIFICATION";
    readonly knownAmbiguities: readonly {
      readonly code: string;
      readonly affectedCanonicalIds: readonly string[];
      readonly explanation: string;
      readonly consequence: string;
    }[];
  };
  readonly intervals: readonly HumanA2ReferenceInterval[];
  readonly preparations: readonly HumanA2ReferencePreparation[];
  readonly fingerprint: string;
}

const minutes = (value: string): number => {
  const [hours, mins] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(mins)) throw new Error(`Invalid reference time ${value}`);
  return hours * 60 + mins;
};

const participantStarts: Readonly<Record<ParticipantId, readonly (readonly [TaskType, string])[]>> = {
  C01: [["IN", "09:00"], ["ESTILISMO_ENTRADA", "09:10"], ["CROMA", "09:30"], ["PRUEBA_VOCAL_LUCIA", "10:30"], ["REALITY_PLATO_ANTES", "11:00"], ["ENSAYO_ESTUDIO_7", "11:15"], ["REALITY_PLATO_DESPUES", "11:30"], ["REDES", "11:55"], ["PASILLO", "12:00"], ["TOTALES_1", "12:20"], ["SODEXO", "13:00"], ["GIRATUTO", "14:40"], ["ESTILISMO_SALIDA", "14:50"], ["OUT", "15:20"]],
  C02: [["IN", "09:00"], ["ESTILISMO_ENTRADA", "09:20"], ["CROMA", "09:40"], ["CORNER_INFLUENCER", "10:00"], ["PRUEBA_VOCAL_LUCIA", "10:15"], ["ENSAYO_ESTUDIO_7", "11:30"], ["REDES", "12:00"], ["PASILLO", "12:05"], ["TOTALES_COREO", "12:20"], ["SILLON", "13:25"], ["SODEXO", "13:35"], ["ESTRELLAS", "14:55"], ["ESTILISMO_SALIDA", "15:10"], ["OUT", "15:20"]],
  C03: [["IN", "09:00"], ["ESTILISMO_ENTRADA", "09:30"], ["CROMA", "09:50"], ["PRUEBA_VOCAL_LUCIA", "10:00"], ["TOTALES_1", "10:35"], ["CORNER_INFLUENCER_MUSIC", "11:05"], ["ENSAYO_ESTUDIO_7", "11:45"], ["REDES", "12:05"], ["PASILLO", "12:20"], ["SODEXO", "13:35"], ["ESTILISMO_SALIDA", "14:15"], ["OUT", "14:20"]],
  C04: [["IN", "09:30"], ["PRUEBA_VOCAL_LUCIA", "09:45"], ["ESTILISMO_ENTRADA", "10:00"], ["CROMA", "10:10"], ["TOTALES_COREO", "10:35"], ["ENSAYO_ESTUDIO_7", "12:00"], ["PASILLO", "12:15"], ["REDES", "12:20"], ["SODEXO", "13:35"], ["GIRATUTO", "15:10"], ["ALFOMBRA_ROJA_EVA", "17:30"], ["ESTILISMO_SALIDA", "17:50"], ["OUT", "17:55"]],
  C05: [["IN", "09:30"], ["ESTILISMO_ENTRADA", "09:40"], ["PRUEBA_VOCAL_JOSE_MARIA", "09:55"], ["CROMA", "10:20"], ["CORNER_MUSIC", "10:40"], ["REALITY_PLATO_ANTES", "12:00"], ["ENSAYO_ESTUDIO_7", "12:15"], ["REALITY_PLATO_DESPUES", "12:30"], ["TOTALES_1", "12:55"], ["PASILLO", "13:25"], ["SILLON", "13:30"], ["SODEXO", "13:45"], ["ESTRELLAS", "14:50"], ["ESTILISMO_SALIDA", "15:05"], ["OUT", "15:20"]],
  C06: [["IN", "09:30"], ["ESTILISMO_ENTRADA", "10:10"], ["CORNER_MUSIC", "10:20"], ["CROMA", "10:30"], ["PRUEBA_VOCAL_JOSE_MARIA", "11:25"], ["PASILLO", "12:10"], ["REDES", "12:15"], ["ENSAYO_ESTUDIO_7", "12:30"], ["TOTALES_COREO", "12:55"], ["SODEXO", "13:45"], ["ESTRELLAS", "14:45"], ["GIRATUTO", "15:05"], ["REALITY_HALL", "16:00"], ["ALFOMBRA_ROJA_CONJUNTA", "18:00"], ["TOTALES_POST_CONJUNTO", "18:10"], ["ESTILISMO_SALIDA", "18:20"], ["OUT", "18:30"]],
  C07: [["IN", "10:00"], ["ESTILISMO_ENTRADA", "10:20"], ["CORNER_INFLUENCER", "10:30"], ["CROMA", "10:40"], ["PRUEBA_VOCAL_JOSE_MARIA", "11:10"], ["TOTALES_1", "11:45"], ["PASILLO", "12:25"], ["REDES", "12:30"], ["ENSAYO_ESTUDIO_7", "12:45"], ["SILLON", "13:35"], ["SODEXO", "13:50"], ["ESTRELLAS", "14:40"], ["ESTILISMO_SALIDA", "14:50"], ["OUT", "14:55"]],
  C08: [["IN", "10:00"], ["ESTILISMO_ENTRADA", "10:30"], ["PRUEBA_VOCAL_JOSE_MARIA", "10:40"], ["CROMA", "10:55"], ["CORNER_INFLUENCER_MUSIC", "11:20"], ["TOTALES_COREO", "11:45"], ["PASILLO", "12:30"], ["REDES", "12:35"], ["REALITY_PLATO_ANTES", "12:45"], ["ENSAYO_ESTUDIO_7", "13:00"], ["REALITY_PLATO_DESPUES", "13:15"], ["SODEXO", "13:30"], ["ESTILISMO_SALIDA", "14:15"], ["OUT", "14:20"]],
  C09: [["IN", "10:00"], ["PRUEBA_VOCAL_JOSE_MARIA", "10:55"], ["ESTILISMO_ENTRADA", "11:10"], ["CROMA", "11:20"], ["CORNER_INFLUENCER", "11:35"], ["REALITY_INFLUENCER", "12:00"], ["PASILLO", "12:35"], ["REDES", "12:40"], ["ENSAYO_ESTUDIO_7", "13:15"], ["SILLON", "13:40"], ["SODEXO", "13:50"], ["ESTRELLAS", "14:35"], ["TOTALES_1", "16:10"], ["ESTILISMO_SALIDA", "17:05"], ["OUT", "17:10"]],
  C10: [["IN", "10:00"], ["PRUEBA_VOCAL_JOSE_MARIA", "10:25"], ["ESTILISMO_ENTRADA", "11:00"], ["REALITY_MANZANO", "11:15"], ["CROMA", "11:50"], ["PASILLO", "12:40"], ["REDES", "12:45"], ["ENSAYO_ESTUDIO_7", "13:30"], ["SILLON", "13:55"], ["ESTRELLAS", "14:30"], ["SODEXO", "14:40"], ["TOTALES_COREO", "16:10"], ["ALFOMBRA_ROJA_CONJUNTA", "18:00"], ["TOTALES_POST_CONJUNTO", "18:10"], ["ESTILISMO_SALIDA", "18:15"], ["OUT", "18:30"]],
  C11: [["IN", "10:00"], ["PRUEBA_VOCAL_JOSE_MARIA", "10:10"], ["ESTILISMO_ENTRADA", "11:30"], ["CROMA", "11:40"], ["CORNER_INFLUENCER", "11:50"], ["PASILLO", "12:45"], ["REDES", "12:50"], ["ENSAYO_ESTUDIO_7", "13:45"], ["SILLON", "14:00"], ["SODEXO", "14:10"], ["TOTALES_1", "15:00"], ["REALITY_BUGGY", "17:00"], ["ESTILISMO_SALIDA", "17:45"], ["OUT", "18:10"]],
  C12: [["IN", "11:10"], ["ESTILISMO_ENTRADA", "11:20"], ["CROMA", "12:00"], ["PASILLO", "12:50"], ["REDES", "12:55"], ["PRUEBA_VOCAL_LUCIA", "13:45"], ["SODEXO", "14:10"], ["GIRATUTO", "15:00"], ["ENSAYO_ESTUDIO_7", "15:15"], ["TOTALES_1", "15:35"], ["CORNER_INFLUENCER", "16:10"], ["REALITY_CONTROL_EVA", "16:30"], ["ESTILISMO_SALIDA", "17:00"], ["OUT", "17:25"]],
  C13: [["IN", "10:30"], ["ESTILISMO_ENTRADA", "10:40"], ["TOTALES_1", "11:10"], ["CROMA", "12:10"], ["PASILLO", "12:55"], ["REDES", "13:00"], ["SILLON", "13:50"], ["PRUEBA_VOCAL_LUCIA", "14:00"], ["SODEXO", "14:15"], ["GIRATUTO", "14:55"], ["ESTRELLAS", "15:00"], ["ENSAYO_ESTUDIO_7", "15:30"], ["ALFOMBRA_ROJA_EVA", "17:45"], ["ESTILISMO_SALIDA", "18:05"], ["OUT", "18:10"]],
  C14: [["IN", "10:30"], ["ESTILISMO_ENTRADA", "10:50"], ["TOTALES_COREO", "11:10"], ["CROMA", "12:20"], ["PASILLO", "13:00"], ["REDES", "13:05"], ["SODEXO", "13:20"], ["PRUEBA_VOCAL_LUCIA", "14:15"], ["GIRATUTO", "14:50"], ["ENSAYO_ESTUDIO_7", "15:45"], ["CORNER_INFLUENCER", "16:00"], ["ESTILISMO_SALIDA", "17:00"], ["OUT", "17:10"]],
  C15: [["IN", "11:10"], ["ESTILISMO_ENTRADA", "11:40"], ["CROMA", "12:30"], ["PASILLO", "13:05"], ["REDES", "13:10"], ["TOTALES_1", "13:30"], ["CORNER_INFLUENCER", "14:00"], ["SILLON", "14:10"], ["PRUEBA_VOCAL_LUCIA", "14:30"], ["GIRATUTO", "14:45"], ["SODEXO", "14:55"], ["ENSAYO_ESTUDIO_7", "16:00"], ["ESTILISMO_SALIDA", "16:50"], ["OUT", "17:25"]],
  C16: [["IN", "11:10"], ["ESTILISMO_ENTRADA", "11:50"], ["CROMA", "12:40"], ["PASILLO", "13:10"], ["REDES", "13:15"], ["TOTALES_COREO", "13:30"], ["CORNER_INFLUENCER", "14:10"], ["SODEXO", "14:25"], ["PRUEBA_VOCAL_JOSE_MARIA", "15:30"], ["ENSAYO_ESTUDIO_7", "16:15"], ["ALFOMBRA_ROJA", "18:10"], ["ESTILISMO_SALIDA", "18:20"], ["OUT", "18:25"]],
  C17: [["IN", "11:40"], ["ESTILISMO_ENTRADA", "12:00"], ["CROMA", "12:50"], ["REALITY_HALL", "13:00"], ["PASILLO", "13:30"], ["REDES", "13:35"], ["ESTRELLAS", "14:25"], ["SODEXO", "14:35"], ["PRUEBA_VOCAL_JOSE_MARIA", "15:15"], ["ENSAYO_ESTUDIO_7", "16:30"], ["TOTALES_1", "16:45"], ["ESTILISMO_SALIDA", "17:20"], ["OUT", "17:25"]],
  C18: [["IN", "11:40"], ["ESTILISMO_ENTRADA", "12:10"], ["CROMA", "13:00"], ["PASILLO", "13:15"], ["REDES", "13:20"], ["SILLON", "13:45"], ["SODEXO", "13:50"], ["CORNER_INFLUENCER", "14:30"], ["PRUEBA_VOCAL_JOSE_MARIA", "15:00"], ["TOTALES_COREO", "15:35"], ["ENSAYO_ESTUDIO_7", "16:45"], ["ESTILISMO_SALIDA", "17:05"], ["OUT", "17:25"]],
  C19: [["IN", "12:30"], ["ESTILISMO_ENTRADA", "12:40"], ["CROMA", "13:10"], ["PASILLO", "13:20"], ["REDES", "13:25"], ["REALITY_CORNER_MUSIC", "13:30"], ["CORNER_INFLUENCER", "14:20"], ["PRUEBA_VOCAL_JOSE_MARIA", "14:45"], ["TOTALES_COREO", "15:00"], ["SODEXO", "15:35"], ["ENSAYO_ESTUDIO_7", "17:00"], ["ESTILISMO_SALIDA", "17:15"], ["OUT", "17:25"]],
};

const technicalStarts: Readonly<Record<string, string>> = {
  "TECH.tech_reality_eva": "16:00",
  "TECH.tech_desmontaje_traslado": "16:20",
  "TECH.tech_totales_post": "16:25",
};

function canonicalProjection(intervals: readonly HumanA2ReferenceInterval[], preparations: readonly HumanA2ReferencePreparation[]): unknown {
  return {
    intervals: intervals.map(({ taskId: id, start, end, duration }) => ({ id, start, end, duration })),
    preparations: preparations.map(({ id, kind, spaceId, start, end, duration }) => ({ id, kind, spaceId, start, end, duration })),
  };
}

function buildReferencePreparations(expanded: ExpandedCanonicalFullA2Template, intervals: readonly HumanA2ReferenceInterval[]): readonly HumanA2ReferencePreparation[] {
  const byId = new Map(intervals.map((interval) => [interval.taskId, interval] as const));
  const preparations: HumanA2ReferencePreparation[] = [{
    id: "human-preparation:p15-estrellas-sillon:estrellas-entry",
    kind: "setup_preparation",
    spaceId: "p15-estrellas-sillon",
    start: 855,
    end: 865,
    duration: 10,
  }];
  for (const [type, spaceId] of [["TOTALES_1", "totales-1"], ["TOTALES_COREO", "totales-coreo"]] as const) {
    const rounds = expanded.tasks.filter((task) => task.type === type).map(({ id }) => byId.get(id)!).sort((left, right) => left.start - right.start || left.taskId.localeCompare(right.taskId, "en"));
    rounds.slice(1).forEach((round, index) => {
      preparations.push({
        id: `human-preparation:${spaceId}:round-${index + 2}`,
        kind: "round_preparation",
        spaceId,
        start: round.start - 5,
        end: round.start,
        duration: 5,
      });
    });
  }
  return Object.freeze(preparations.map((preparation) => Object.freeze(preparation)).sort((left, right) => left.start - right.start || left.id.localeCompare(right.id, "en")));
}

function buildStarts(): Map<string, number> {
  const starts = new Map<string, number>();
  for (const [participantId, entries] of Object.entries(participantStarts) as [ParticipantId, readonly (readonly [TaskType, string])[]][]) {
    for (const [type, start] of entries) {
      const id = taskId(participantId, type);
      if (starts.has(id)) throw new Error(`Duplicate human reference task ${id}`);
      starts.set(id, minutes(start));
    }
  }
  for (const [id, start] of Object.entries(technicalStarts)) {
    if (starts.has(id)) throw new Error(`Duplicate human reference task ${id}`);
    starts.set(id, minutes(start));
  }
  return starts;
}

export function createHumanA2Reference(expanded: ExpandedCanonicalFullA2Template = expandCanonicalFullA2Template(createCanonicalFullA2Template())): HumanA2Reference {
  const starts = buildStarts();
  const taskById = new Map(expanded.tasks.map((task) => [task.id, task] as const));
  const missing = expanded.taskIds.filter((id) => !starts.has(id));
  const extra = [...starts.keys()].filter((id) => !taskById.has(id)).sort();
  if (missing.length || extra.length) throw new Error(`Human A2 reference identity mismatch: missing=${missing.join(",")} extra=${extra.join(",")}`);
  const intervals = expanded.tasks.map((task: CanonicalTask) => {
    const start = starts.get(task.id)!;
    return Object.freeze({ taskId: task.id, start, end: start + task.duration, duration: task.duration });
  }).sort((left, right) => left.start - right.start || left.taskId.localeCompare(right.taskId, "en"));
  const preparations = buildReferencePreparations(expanded, intervals);
  const fingerprint = createHash("sha256").update(JSON.stringify(canonicalProjection(intervals, preparations))).digest("hex");
  return Object.freeze({
    contractVersion: HUMAN_A2_REFERENCE_CONTRACT_VERSION,
    corpusDate: "2025-06-15",
    referenceOnly: true,
    forbiddenAsPlannerInput: true,
    sourceDocuments: Object.freeze(["ENSAYO_A2_LV.pdf", "ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf", "DOCUMENTO_MAESTRO_INTERPRETACION_ENSAYO_A2_v1.md"] as const),
    appliedCorrections: Object.freeze(["C09_DUPLICATE_SODEXO_REMOVED", "C12_SODEXO_40_MINUTES_AT_C11_REFERENCE_WINDOW", "C13_FINAL_C_IS_ESTILISMO_SALIDA", "C06_C10_JOINT_ALFOMBRA_ROJA_10_MINUTES", "C06_C10_JOINT_TOTALES_POST_5_MINUTES", "C16_ALFOMBRA_ROJA_WITHOUT_TOTALES_POST", "REALITY_EVA_TECHNICAL_CHAIN_HAS_NO_PARTICIPANT"]),
    sourceAudit: Object.freeze({
      status: "REQUIRES_CONFIGURATION_CLARIFICATION" as const,
      knownAmbiguities: Object.freeze([
        Object.freeze({
          code: "STYLING_CAPACITY_UNSPECIFIED_BY_MASTER",
          affectedCanonicalIds: Object.freeze(["space:styling"]),
          explanation: "The human reference contains simultaneous styling intervals, while the A2 master defines styling duration and ordering but does not declare single-person capacity.",
          consequence: "Do not use an assumed styling capacity to declare the human reference hard-valid or invalid; effective day capacity must come from explicit configuration or source clarification.",
        }),
        Object.freeze({
          code: "C01_REDES_OVERLAPS_C11_CORNER_IN_P14_RECURSOS_REFERENCE",
          affectedCanonicalIds: Object.freeze(["C01.redes", "C11.corner_influencer", "space:p14-recursos"]),
          explanation: "The contestant reference places C01 Redes at 11:55-12:00 while the spaces reference places C11 Corner Influencer at 11:50-12:00; both map canonically to Plató 14 - Recursos, whose master contract states single-person use.",
          consequence: "The raw human timing remains preserved, but P14 Recursos hard-validity cannot be normalized by silently moving either task; source/configuration clarification is required.",
        }),
      ]),
    }),
    intervals: Object.freeze(intervals),
    preparations,
    fingerprint,
  });
}
