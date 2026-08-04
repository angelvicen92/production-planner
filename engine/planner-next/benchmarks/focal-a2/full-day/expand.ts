import type { AnchoredOperationContract, CanonicalFullA2Template, CanonicalTask, ExpandedCanonicalFullA2Template, JointOperationContract, ParticipantId, TaskType, TechnicalChainContract } from "./types";
import { EXPECTED_PARTICIPANT_TASK_MATRIX } from "./manifest";

export function taskId(participantId: string, type: TaskType): string {
  return `${participantId}.${type.toLowerCase()}`;
}

const ANCHORED_PARTICIPANTS = ["C01", "C05", "C08"] as const;
const TECHNICAL_CHAIN_ID = "technical.reality-eva-transfer-totales-post";
const TECHNICAL_RESOURCE_IDS = ["cam-3", "cam-4", "son-1", "eva"] as const;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function sorted<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
}

function participantTasks(template: CanonicalFullA2Template, participantId: ParticipantId): CanonicalTask[] {
  const assignment = template.assignments.find((entry) => entry.participantId === participantId);
  const sourceTypes = EXPECTED_PARTICIPANT_TASK_MATRIX[participantId] ?? [];
  const allTaskIds = new Set(sourceTypes.map((type) => taskId(participantId, type)));
  const vocalType: TaskType | null = sourceTypes.includes("PRUEBA_VOCAL_LUCIA")
    ? "PRUEBA_VOCAL_LUCIA"
    : sourceTypes.includes("PRUEBA_VOCAL_JOSE_MARIA") ? "PRUEBA_VOCAL_JOSE_MARIA" : null;

  return sourceTypes.map((type) => {
    const definition = template.taskTypes[type];
    const id = taskId(participantId, type);
    const dependencies = new Set<string>();
    if (type === "ESTILISMO_ENTRADA") dependencies.add(taskId(participantId, "IN"));
    if (type === "PRUEBA_VOCAL_LUCIA" || type === "PRUEBA_VOCAL_JOSE_MARIA") dependencies.add(taskId(participantId, "IN"));
    if (!["IN", "ESTILISMO_ENTRADA", "PRUEBA_VOCAL_LUCIA", "PRUEBA_VOCAL_JOSE_MARIA"].includes(type)) dependencies.add(taskId(participantId, "ESTILISMO_ENTRADA"));
    if (type === "ENSAYO_ESTUDIO_7" && vocalType) dependencies.add(taskId(participantId, vocalType));
    if (type === "REALITY_PLATO_ANTES") dependencies.add(taskId(participantId, "ESTILISMO_ENTRADA"));
    if (type === "ENSAYO_ESTUDIO_7" && allTaskIds.has(taskId(participantId, "REALITY_PLATO_ANTES"))) dependencies.add(taskId(participantId, "REALITY_PLATO_ANTES"));
    if (type === "REALITY_PLATO_DESPUES") dependencies.add(taskId(participantId, "ENSAYO_ESTUDIO_7"));
    if (type === "TOTALES_POST_CONJUNTO") dependencies.add(taskId(participantId, "ALFOMBRA_ROJA_CONJUNTA"));
    if (type === "ESTILISMO_SALIDA") {
      for (const dependencyType of sourceTypes) {
        if (dependencyType !== "ESTILISMO_SALIDA" && dependencyType !== "OUT") dependencies.add(taskId(participantId, dependencyType));
      }
    }
    if (type === "OUT") dependencies.add(taskId(participantId, "ESTILISMO_SALIDA"));

    const coachId = type === "PRUEBA_VOCAL_LUCIA" || type === "PRUEBA_VOCAL_JOSE_MARIA" || type === "ENSAYO_ESTUDIO_7"
      ? assignment?.coachId
      : undefined;
    const anchored = ANCHORED_PARTICIPANTS.includes(participantId as typeof ANCHORED_PARTICIPANTS[number])
      && (type === "REALITY_PLATO_ANTES" || type === "ENSAYO_ESTUDIO_7" || type === "REALITY_PLATO_DESPUES");
    const jointGroupId = type === "ALFOMBRA_ROJA_CONJUNTA"
      ? "joint.alfombra-roja.C06-C10"
      : type === "TOTALES_POST_CONJUNTO" ? "joint.totales-post.C06-C10" : undefined;
    const requiredResourceIds = new Set(definition.knownResourceIds);
    if (type === "ENSAYO_ESTUDIO_7" && coachId) requiredResourceIds.add(coachId);

    return {
      id,
      type,
      participantId,
      duration: definition.duration,
      spaceId: definition.spaceId,
      dependencies: [...dependencies].filter((dependency) => dependency !== id).sort(),
      operationalKind: definition.operationalKind,
      requiredResourceIds: [...requiredResourceIds].sort(),
      coachId,
      blockKey: type === "ENSAYO_ESTUDIO_7" ? coachId : undefined,
      setupFamilyId: type === "SILLON" ? "sillon" : type === "ESTRELLAS" ? "estrellas" : undefined,
      jointGroupId,
      anchoredOperationId: anchored ? `anchored.reality-plato.${participantId}` : undefined,
      itinerantUnitId: type.startsWith("REALITY_") ? "reality-unit" : undefined,
      meal: type === "SODEXO" ? { kind: "participant_meal", duration: 40, occupiesExclusiveSpace: false } : undefined,
      transport: type === "IN" ? { direction: "arrival" } : type === "OUT" ? { direction: "departure" } : undefined,
      isAnchoredSegment: type === "REALITY_PLATO_ANTES" || type === "REALITY_PLATO_DESPUES" ? true : undefined,
      editorialTags: [],
    } satisfies CanonicalTask;
  });
}

function technicalTasks(template: CanonicalFullA2Template): CanonicalTask[] {
  const orderedTypes: readonly TaskType[] = ["TECH_REALITY_EVA", "TECH_DESMONTAJE_TRASLADO", "TECH_TOTALES_POST"];
  return orderedTypes.map((type, index) => {
    const definition = template.taskTypes[type];
    const id = `TECH.${type.toLowerCase()}`;
    const previous = index === 0 ? null : `TECH.${orderedTypes[index - 1]!.toLowerCase()}`;
    return {
      id,
      type,
      duration: definition.duration,
      spaceId: definition.spaceId,
      dependencies: previous ? [previous] : [],
      operationalKind: "technical",
      requiredResourceIds: [...TECHNICAL_RESOURCE_IDS],
      technicalChainId: TECHNICAL_CHAIN_ID,
      editorialTags: [],
    } satisfies CanonicalTask;
  });
}

function anchoredOperations(): AnchoredOperationContract[] {
  return ANCHORED_PARTICIPANTS.map((participantId) => ({
    id: `anchored.reality-plato.${participantId}`,
    participantId,
    beforeTaskIds: [taskId(participantId, "REALITY_PLATO_ANTES")],
    anchorTaskId: taskId(participantId, "ENSAYO_ESTUDIO_7"),
    afterTaskIds: [taskId(participantId, "REALITY_PLATO_DESPUES")],
    adjacency: "REQUIRED",
    internalTransition: "INCLUDED",
    resourceContinuity: "REQUIRED",
    orderedTaskIds: [taskId(participantId, "REALITY_PLATO_ANTES"), taskId(participantId, "ENSAYO_ESTUDIO_7"), taskId(participantId, "REALITY_PLATO_DESPUES")],
  }));
}

function jointOperations(): JointOperationContract[] {
  return [
    {
      id: "joint.alfombra-roja.C06-C10",
      taskType: "ALFOMBRA_ROJA_CONJUNTA",
      memberParticipantIds: ["C06", "C10"],
      taskIds: [taskId("C06", "ALFOMBRA_ROJA_CONJUNTA"), taskId("C10", "ALFOMBRA_ROJA_CONJUNTA")],
      duration: 10,
      spaceId: "alfombra-roja",
      synchronizedStartAndEnd: true,
    },
    {
      id: "joint.totales-post.C06-C10",
      taskType: "TOTALES_POST_CONJUNTO",
      memberParticipantIds: ["C06", "C10"],
      taskIds: [taskId("C06", "TOTALES_POST_CONJUNTO"), taskId("C10", "TOTALES_POST_CONJUNTO")],
      duration: 5,
      spaceId: "totales-post",
      synchronizedStartAndEnd: true,
      sequenceAfterJointGroupId: "joint.alfombra-roja.C06-C10",
    },
  ];
}

function technicalChains(): TechnicalChainContract[] {
  return [{
    id: TECHNICAL_CHAIN_ID,
    orderedTaskIds: ["TECH.tech_reality_eva", "TECH.tech_desmontaje_traslado", "TECH.tech_totales_post"],
    adjacency: "REQUIRED",
    resourceContinuity: "REQUIRED",
    requiredResourceIds: [...TECHNICAL_RESOURCE_IDS],
  }];
}

export function expandCanonicalFullA2Template(template: CanonicalFullA2Template): ExpandedCanonicalFullA2Template {
  const participants = [...template.participants].sort();
  const tasks = sorted([
    ...participants.flatMap((participantId) => participantTasks(template, participantId as ParticipantId)),
    ...technicalTasks(template),
  ], (task) => task.id);
  const countsByType = Object.fromEntries(Object.keys(template.taskTypes).map((type) => [type, 0])) as Record<TaskType, number>;
  for (const task of tasks) countsByType[task.type] += 1;
  return deepFreeze({
    contractVersion: template.contractVersion,
    participants: participants as ParticipantId[],
    tasks,
    taskIds: tasks.map((task) => task.id),
    countsByType,
    anchoredOperations: anchoredOperations(),
    jointOperations: jointOperations(),
    technicalChains: technicalChains(),
    spaces: sorted(template.spaces, (space) => space.id),
    resources: sorted(template.resources, (resource) => resource.id),
    rules: template.rules,
    requiredCreationInputs: [...template.requiredCreationInputs].sort(),
  });
}
