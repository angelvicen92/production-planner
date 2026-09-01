import type { PlannerNextProblem } from "../../contracts";
import { focalA2Problem } from "./focalA2Problem";
import { focalA2Reference } from "./focalA2Reference";
import {
  evaluateContinuousResourcePresence,
  type PresenceConcentrationPolicy,
} from "./evaluateContinuousResourcePresence";
export type FocalA2ParticipantRequirementProfile = {
  participantId: string;
  displayName: string;
  requiresBand: boolean;
  usesInstrument: boolean;
  instrumentAnnotation: string | null;
  sourceConfidence:
    | "EXPLICIT_MAIN_STAGE_ANNOTATION"
    | "USER_CONFIRMED_COMPLEMENT_OF_EXPLICIT_INSTRUMENT_SET";
};
export type ProjectedMainTaskRequirements = {
  participantId: string;
  requiredResourceIds: string[];
};
export type ContinuousResourceReferencePolicy = {
  resourceId: string;
  assignedSpaceId: string;
  availability: { start: number; end: number }[];
  authorizedMeal: { start: number; end: number };
  presenceConcentrationPolicy: PresenceConcentrationPolicy;
};
export type CurrentBandMode =
  | "CURRENT_OFF"
  | "CURRENT_MAXIMUM"
  | "CURRENT_PREFERRED"
  | "CURRENT_REQUIRED";
const instruments: Record<string, string> = {
  "moises-salazar-ramirez": "SOLO A PIANO",
  "angel-gonzalez": "GUITARRA",
  "julio-gomez": "GUITARRA",
  "lina-isabel-garcia-salcedo": "GUITARRISTA FLAMENCO",
  "marta-fonrali": "GUITARRA",
  "pere-portero": "GUITARRA",
};
// Daily production configuration. This is deliberately independent from the
// instrument annotations above: instrument metadata cannot decide resource use.
const requiresBandByParticipantId: Readonly<Record<string, boolean>> = Object.freeze({
  "cristina-zuloaga": true,
  "moises-salazar-ramirez": false,
  "angel-gonzalez": false,
  "carmen-maria-saborido": true,
  "julio-gomez": false,
  "lina-isabel-garcia-salcedo": false,
  "naomi-ines-carretero": true,
  "jose-javier-cuenca": true,
  "luis-belda": true,
  "gisela-montserrat": true,
  "linet-varela": true,
  "marta-fonrali": false,
  "eva-martin-fernandez": true,
  "noa-marcos-diez": true,
  "claudia-torrent": true,
  "adrian-darrel": true,
  "nela-garcia": true,
  "daniel-hernan-barres": true,
  "pere-portero": false,
});
export const focalA2ParticipantRequirementProfiles: FocalA2ParticipantRequirementProfile[] =
  focalA2Reference.participants.map((p) => {
    const annotation = instruments[p.participantId];
    return {
      participantId: p.participantId,
      displayName: p.displayName,
      requiresBand: requiresBandByParticipantId[p.participantId]!,
      usesInstrument: Boolean(annotation),
      instrumentAnnotation: annotation ?? null,
      sourceConfidence: annotation
        ? "EXPLICIT_MAIN_STAGE_ANNOTATION"
        : "USER_CONFIRMED_COMPLEMENT_OF_EXPLICIT_INSTRUMENT_SET",
    };
  });
export const FOCAL_A2_BAND_RESOURCE_ID = "focal-a2-continuous-resource";
export const focalA2ContinuousResourcePolicy: ContinuousResourceReferencePolicy =
  {
    resourceId: FOCAL_A2_BAND_RESOURCE_ID,
    assignedSpaceId: "main-stage",
    availability: [{ start: 675, end: 1035 }],
    authorizedMeal: { start: 840, end: 915 },
    presenceConcentrationPolicy: "PREFERRED",
  };
export function projectRequirement(
  profile: Pick<
    FocalA2ParticipantRequirementProfile,
    "participantId" | "requiresBand" | "usesInstrument"
  >,
  existing: string[] = [],
): ProjectedMainTaskRequirements {
  return {
    participantId: profile.participantId,
    requiredResourceIds: profile.requiresBand
      ? [...new Set([...existing, FOCAL_A2_BAND_RESOURCE_ID])]
      : [...existing],
  };
}
export function projectFocalA2BandProblem(
  mode: CurrentBandMode,
  profiles: ReadonlyArray<Pick<FocalA2ParticipantRequirementProfile, "participantId" | "requiresBand">> =
    focalA2ParticipantRequirementProfiles,
): PlannerNextProblem {
  const p = focalA2Problem(),
    band = new Set(
      profiles
        .filter((x) => x.requiresBand)
        .map((x) => x.participantId),
    );
  return {
    ...p,
    resources: [
      ...p.resources,
      {
        id: FOCAL_A2_BAND_RESOURCE_ID,
        availability: [{ start: 675, end: 1035 }],
        presencePreference: mode === "CURRENT_OFF" ? "OFF" : "MAXIMUM",
        ...(mode === "CURRENT_PREFERRED" || mode === "CURRENT_REQUIRED"
          ? {
              presenceConcentrationPolicy: mode === "CURRENT_REQUIRED" ? "REQUIRED" as const : "PREFERRED" as const,
              assignedSpaceId: "main-stage",
            }
          : {}),
      },
    ],
    tasks: p.tasks.map((t) =>
      t.kind === "main" && band.has(t.participantId)
        ? {
            ...t,
            requiredResourceIds: [
              ...new Set([
                ...(t.requiredResourceIds ?? []),
                FOCAL_A2_BAND_RESOURCE_ID,
              ]),
            ],
          }
        : {
            ...t,
            requiredResourceIds: t.requiredResourceIds
              ? [...t.requiredResourceIds]
              : undefined,
          },
    ),
  };
}
export const focalA2BandMeal = {
  spaceId: "main-stage",
  assignedSpaceId: "main-stage",
  start: 840,
  end: 915,
};
export function referenceBandPresence() {
  const ids = new Set(
    focalA2ParticipantRequirementProfiles
      .filter((x) => x.requiresBand)
      .map((x) => x.participantId),
  );
  return evaluateContinuousResourcePresence(
    focalA2Reference.tasks.filter(
      (t) => t.kind === "main" && ids.has(t.participantId),
    ),
    focalA2BandMeal,
    "PREFERRED",
    ids.size,
  );
}
export function scheduledBandPresence(
  tasks: Array<{
    id: string;
    participantId?: string;
    kind: string;
    start: number;
    end: number;
  }>,
) {
  const ids = new Set(
    focalA2ParticipantRequirementProfiles
      .filter((x) => x.requiresBand)
      .map((x) => x.participantId),
  );
  return evaluateContinuousResourcePresence(
    tasks.filter(
      (t) => t.kind === "main" && t.participantId && ids.has(t.participantId),
    ),
    focalA2BandMeal,
    "PREFERRED",
    ids.size,
  );
}

export interface FocalTaskSpan {
  start: number | null;
  end: number | null;
  spanMinutes: number;
}

/** Derives the full focal interval without sorting or mutating the input. */
export function focalTaskSpan(
  tasks: ReadonlyArray<{ start: number; end: number }>,
): FocalTaskSpan {
  if (tasks.length === 0) {
    return { start: null, end: null, spanMinutes: 0 };
  }

  const start = Math.min(...tasks.map((task) => task.start));
  const end = Math.max(...tasks.map((task) => task.end));
  return { start, end, spanMinutes: end - start };
}
