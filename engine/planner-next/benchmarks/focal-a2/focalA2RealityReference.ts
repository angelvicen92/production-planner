import type { ParticipantTask, PlannerNextProblem, Window } from "../../contracts";
import { projectFocalA2BandProblem } from "./focalA2BandReference";
import { focalA2RealityAuxiliaryPolicy, focalA2RealityParticipantAvailabilityOverrides } from "./focalA2RealityOperationalConfiguration";

export interface ItinerantUnitProfile {
  id: string;
  memberResourceIds: string[];
  availability: Window[];
  informationalAssignments?: string[];
}

interface OperationInformation {
  id: string;
  unitId: string;
  participantId: string;
  annotations?: string[];
  location: string;
}

export interface StandaloneItinerantOperationProfile extends OperationInformation {
  type: "STANDALONE";
  duration: number;
  spaceId: string;
}

export interface WrappedItinerantOperationProfile extends OperationInformation {
  type: "ANCHORED_ACCOMPANIMENT";
  anchorTaskId: string;
  before: { duration: number; spaceId: string };
  after: { duration: number; spaceId: string };
  adjacency: "REQUIRED";
  internalTransition: "INCLUDED";
  resourceContinuity: "REQUIRED";
}

export type ItinerantOperationProfile =
  | StandaloneItinerantOperationProfile
  | WrappedItinerantOperationProfile;

export const realitySourceDocuments = [
  { name: "ENSAYO_A2_LV.pdf", sha256: "0207f3bb59621c263219676153aae50c0cf1a98c1089b8bd732ac63e54f8df18" },
  { name: "ENSAYO_A2_LV 15 JUNIO 2025 - DESGLOSE A2.pdf", sha256: "8f96af987db37a0c8b5c1fd8870aad36d46b721ed81a0535bc22b8fb10f312b3" },
] as const;

export const itinerantUnitProfiles: ItinerantUnitProfile[] = [
  { id: "reality-unit-morning-a", memberResourceIds: ["reality-camera-3", "reality-sound-1"], availability:[{start:660,end:840}], informationalAssignments: ["Redacción A", "Producción A"] },
  { id: "reality-unit-morning-b", memberResourceIds: ["reality-camera-4", "reality-sound-2"], availability:[{start:675,end:810}], informationalAssignments: ["Redacción B", "Producción B"] },
  { id: "reality-unit-afternoon-combined", memberResourceIds: ["reality-camera-3", "reality-camera-4", "reality-sound-1"], availability:[{start:960,end:1080}], informationalAssignments: ["Redacción A", "Producción A"] },
];

const standalone = (
  id: string, participantId: string, unitId: string, duration: number,
  spaceId: string, location: string, annotations: string[] = [],
): StandaloneItinerantOperationProfile => ({
  id, type: "STANDALONE", unitId, participantId, duration, spaceId, location,
  annotations,
});

const wrap = (
  id: string, participantId: string, unitId: string, annotations: string[] = [],
): WrappedItinerantOperationProfile => ({
  id, type: "ANCHORED_ACCOMPANIMENT", unitId, participantId,
  anchorTaskId: `main-${participantId}`,
  before: { duration: 15, spaceId: "reality-location-stage" },
  after: { duration: 15, spaceId: "reality-location-stage" },
  adjacency: "REQUIRED", internalTransition:"INCLUDED", resourceContinuity:"REQUIRED", location: "PLATÓ", annotations,
});

const A = "reality-unit-morning-a";
const B = "reality-unit-morning-b";
const C = "reality-unit-afternoon-combined";

export const itinerantOperationProfiles: ItinerantOperationProfile[] = [
  wrap("reality-operation-01", "cristina-zuloaga", A, ["CON MADRE"]),
  standalone("reality-operation-02", "luis-belda", A, 30, "reality-location-influencer-corner", "CORNER INFLUENCER", ["TROMBÓN"]),
  wrap("reality-operation-03", "jose-javier-cuenca", A),
  standalone("reality-operation-04", "pere-portero", A, 30, "reality-location-music-corner", "CORNER MUSIC", ["INSTRUMENTOS: GUITARRA, BAJO, PIANO, CAJÓN"]),
  standalone("reality-operation-05", "gisela-montserrat", B, 30, "reality-location-manzano", "MANZANO"),
  wrap("reality-operation-06", "julio-gomez", B, ["GUITARRA", "CON PADRE"]),
  standalone("reality-operation-07", "nela-garcia", B, 30, "reality-location-hall-p14", "HALL P.14", ["MAQUILLAJE, ANILLOS, RESPIRADOR, BRILLANTES Y PEINE", "ESPEJO GRANDE CON LUCES"]),
  standalone("reality-operation-08", "lina-isabel-garcia-salcedo", C, 30, "reality-location-hall-p14", "HALL P.14", ["TABLET PARA VIDEOLLAMADA"]),
  standalone("reality-operation-09", "marta-fonrali", C, 30, "reality-location-control", "CONTROL"),
  standalone("reality-operation-10", "linet-varela", C, 30, "reality-location-buggy", "BUGGY", ["COLLAR AMULETO", "TABLET CON MENSAJE"]),
  standalone("reality-operation-11", "carmen-maria-saborido", C, 15, "reality-location-red-carpet", "ALFOMBRA ROJA", ["A. ROJA EVA"]),
  standalone("reality-operation-12", "eva-martin-fernandez", C, 15, "reality-location-red-carpet", "ALFOMBRA ROJA", ["A. ROJA EVA"]),
];

export const focalA2RealityTasks = itinerantOperationProfiles;

const standaloneOperations = itinerantOperationProfiles.filter(
  (operation): operation is StandaloneItinerantOperationProfile => operation.type === "STANDALONE",
);
const wrappedOperations = itinerantOperationProfiles.filter(
  (operation): operation is WrappedItinerantOperationProfile => operation.type === "ANCHORED_ACCOMPANIMENT",
);

export const realityReferenceValidation = {
  operationProfileCount: itinerantOperationProfiles.length,
  wrappedOperationCount: wrappedOperations.length,
  standaloneOperationCount: standaloneOperations.length,
  wrappedBeforeSegmentCount: wrappedOperations.length,
  wrappedAfterSegmentCount: wrappedOperations.length,
  wrappedAnchorCount: new Set(wrappedOperations.map((operation) => operation.anchorTaskId)).size,
  totalItinerantResourceMinutes: itinerantOperationProfiles.reduce(
    (total, operation) => total + (operation.type === "STANDALONE" ? operation.duration : 45), 0,
  ),
  projectedTaskCountWhenSupported: 53,
};

const spaces = [...new Set([...standaloneOperations.map((operation) => operation.spaceId),"reality-location-stage"])]
  .map((id) => ({ id, availability: [{ start: 540, end: 1080 }] }));
const memberIds = [...new Set(itinerantUnitProfiles.flatMap((unit) => unit.memberResourceIds))];

export const realityResourceAvailability: Record<string, Array<{ start: number; end: number }>> = {
  "reality-camera-3": [{ start: 660, end: 840 }, { start: 915, end: 1080 }],
  "reality-sound-1": [{ start: 660, end: 840 }, { start: 915, end: 1080 }],
  "reality-camera-4": [{ start: 675, end: 810 }, { start: 885, end: 1080 }],
  "reality-sound-2": [{ start: 675, end: 810 }],
};

export function projectStandaloneFocalA2RealityProblem(
  operationalCorpus: ItinerantOperationProfile[] = itinerantOperationProfiles,
): PlannerNextProblem {
  const problem = projectFocalA2BandProblem("CURRENT_PREFERRED");
  const selectedStandalone = operationalCorpus.filter((operation): operation is StandaloneItinerantOperationProfile => operation.type === "STANDALONE");
  return {
    ...problem,
    day: { ...problem.day, end: 1080 },
    auxiliaryPolicy: { ...focalA2RealityAuxiliaryPolicy },
    spaces: [...problem.spaces, ...spaces],
    resources: [...problem.resources, ...memberIds.map((id) => ({
      id, availability: realityResourceAvailability[id]!.map((window) => ({ ...window })), presencePreference: "OFF" as const, transitionMinutes: 0,
    }))],
    participants: problem.participants.map((participant) => Object.prototype.hasOwnProperty.call(focalA2RealityParticipantAvailabilityOverrides,participant.id)
      ? { ...participant, availability: focalA2RealityParticipantAvailabilityOverrides[participant.id]!.map((window) => ({ ...window })) }
      : { ...participant, availability: participant.availability.map((window) => ({ ...window })) }),
    tasks: [...problem.tasks, ...selectedStandalone.map((operation): ParticipantTask => ({
      id: operation.id, kind: "auxiliary", participantId: operation.participantId,
      duration: operation.duration, spaceId: operation.spaceId, dependencies: [],
      requiredResourceIds: [...itinerantUnitProfiles.find((unit) => unit.id === operation.unitId)!.memberResourceIds],
      availability: itinerantUnitProfiles.find((unit) => unit.id === operation.unitId)!.availability.map(window=>({...window})),
    }))],
  };
}

export const projectFocalA2RealityProblem = projectStandaloneFocalA2RealityProblem;
export const projectNeutralStandaloneFocalA2RealityProblem = projectStandaloneFocalA2RealityProblem;

export function projectCombinedFocalA2ItinerantProblem(operationalCorpus:ItinerantOperationProfile[]=itinerantOperationProfiles):PlannerNextProblem{
  const problem=projectStandaloneFocalA2RealityProblem(operationalCorpus);
  const wraps=operationalCorpus.filter((operation):operation is WrappedItinerantOperationProfile=>operation.type==="ANCHORED_ACCOMPANIMENT");
  for(const operation of wraps){
    const anchor=problem.tasks.find(task=>task.id===operation.anchorTaskId)!;
    const unit=itinerantUnitProfiles.find(candidate=>candidate.id===operation.unitId)!;
    const requiredResourceIds=[...new Set([...(anchor.requiredResourceIds??[]),...unit.memberResourceIds])].sort();
    anchor.requiredResourceIds=requiredResourceIds; anchor.availability=unit.availability.map(window=>({...window}));
    problem.tasks.push({id:`${operation.id}-before`,kind:"auxiliary",participantId:operation.participantId,duration:operation.before.duration,spaceId:operation.before.spaceId,dependencies:[],requiredResourceIds:[...unit.memberResourceIds],availability:unit.availability.map(window=>({...window}))},{id:`${operation.id}-after`,kind:"auxiliary",participantId:operation.participantId,duration:operation.after.duration,spaceId:operation.after.spaceId,dependencies:[],requiredResourceIds:[...unit.memberResourceIds],availability:unit.availability.map(window=>({...window}))});
  }
  problem.anchoredAccompaniments=wraps.map(operation=>({id:operation.id,anchorTaskId:operation.anchorTaskId,beforeTaskIds:[`${operation.id}-before`],afterTaskIds:[`${operation.id}-after`],adjacency:"REQUIRED",internalTransition:"INCLUDED",resourceContinuity:"REQUIRED"}));
  return problem;
}
