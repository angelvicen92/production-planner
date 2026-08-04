import { EXPECTED_COACH_BY_PARTICIPANT, EXPECTED_COUNTS_BY_TYPE, EXPECTED_PARTICIPANT_TASK_MATRIX, TASK_TYPES } from "./manifest";
import { taskId } from "./expand";
import type { CanonicalTask, ExpandedCanonicalFullA2Template, ParticipantId, TaskType, ValidationInvariantResult, ValidationIssue, ValidationResult } from "./types";
import { PARTICIPANT_IDS } from "./types";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function ids(tasks: readonly CanonicalTask[]): string[] {
  return tasks.map((task) => task.id).sort();
}

function transitiveDependencies(taskById: Map<string, CanonicalTask>, taskIdValue: string, seen = new Set<string>()): Set<string> {
  const task = taskById.get(taskIdValue);
  if (!task) return seen;
  for (const dependency of task.dependencies) {
    if (!seen.has(dependency)) {
      seen.add(dependency);
      transitiveDependencies(taskById, dependency, seen);
    }
  }
  return seen;
}

function hasCycle(taskById: Map<string, CanonicalTask>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of taskById.get(id)?.dependencies ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...taskById.keys()].some(visit);
}

function issue(invariantCode: string, code: string, entityId: string, message: string): ValidationIssue {
  return { invariantCode, code, entityId, message };
}

function invariant(code: string, issues: readonly ValidationIssue[]): ValidationInvariantResult {
  return {
    code,
    passed: issues.length === 0,
    evaluated: true,
    issueCodes: [...new Set(issues.map((entry) => entry.code))].sort(),
    affectedCanonicalIds: [...new Set(issues.map((entry) => entry.entityId))].sort(),
  };
}

function taskTypesByParticipant(expansion: ExpandedCanonicalFullA2Template, participantId: string): TaskType[] {
  return expansion.tasks.filter((task) => task.participantId === participantId).map((task) => task.type);
}

const invariantChecks: ReadonlyArray<[string, (expansion: ExpandedCanonicalFullA2Template) => ValidationIssue[]]> = [
  ["PARTICIPANT_SET", (expansion) => {
    const expected = [...PARTICIPANT_IDS];
    const actual = [...expansion.participants];
    return JSON.stringify(actual) === JSON.stringify(expected) && new Set(actual).size === expected.length
      ? []
      : [issue("PARTICIPANT_SET", "PARTICIPANT_SET_INVALID", "participants", "Expected canonical C01-C19 exactly once and in order.")];
  }],
  ["UNIQUE_TASK_IDS", (expansion) => {
    const seen = new Set<string>();
    return expansion.tasks.flatMap((task) => {
      if (seen.has(task.id)) return [issue("UNIQUE_TASK_IDS", "DUPLICATE_TASK_ID", task.id, "Task id is duplicated.")];
      seen.add(task.id);
      return [];
    });
  }],
  ["GLOBAL_COUNTS", (expansion) => {
    const contestantCount = expansion.tasks.filter((task) => task.participantId).length;
    const technicalCount = expansion.tasks.filter((task) => !task.participantId).length;
    const issues: ValidationIssue[] = [];
    if (contestantCount !== 266) issues.push(issue("GLOBAL_COUNTS", "CONTESTANT_TASK_COUNT_MISMATCH", "contestantTasks", `Expected 266 contestant tasks, got ${contestantCount}.`));
    if (technicalCount !== 3) issues.push(issue("GLOBAL_COUNTS", "TECHNICAL_TASK_COUNT_MISMATCH", "technicalTasks", `Expected 3 technical tasks, got ${technicalCount}.`));
    if (expansion.tasks.length !== 269) issues.push(issue("GLOBAL_COUNTS", "TOTAL_TASK_COUNT_MISMATCH", "tasks", `Expected 269 total tasks, got ${expansion.tasks.length}.`));
    return issues;
  }],
  ["COUNTS_BY_TYPE", (expansion) => Object.entries(EXPECTED_COUNTS_BY_TYPE).flatMap(([type, expected]) => {
    const actual = expansion.countsByType[type as TaskType] ?? 0;
    return actual === expected ? [] : [issue("COUNTS_BY_TYPE", "COUNT_BY_TYPE_MISMATCH", type, `Expected ${expected} tasks of type ${type}, got ${actual}.`)];
  })],
  ["DURATION_CATALOG", (expansion) => expansion.tasks.flatMap((task) => {
    const expected = TASK_TYPES[task.type]?.duration;
    return task.duration === expected ? [] : [issue("DURATION_CATALOG", "DURATION_CHANGED", task.id, `Expected duration ${expected}, got ${task.duration}.`)];
  })],
  ["PARTICIPANT_TASK_MATRIX", (expansion) => Object.entries(EXPECTED_PARTICIPANT_TASK_MATRIX).flatMap(([participantId, expected]) => {
    const actual = taskTypesByParticipant(expansion, participantId).sort();
    const expectedSorted = [...expected].sort();
    return JSON.stringify(actual) === JSON.stringify(expectedSorted) ? [] : [issue("PARTICIPANT_TASK_MATRIX", "PARTICIPANT_MATRIX_MISMATCH", participantId, "Participant task set does not match source matrix.")];
  })],
  ["COACH_ASSIGNMENT", (expansion) => Object.entries(EXPECTED_COACH_BY_PARTICIPANT).flatMap(([participantId, expectedCoach]) => {
    const coachTasks = expansion.tasks.filter((task) => task.participantId === participantId && (task.type === "PRUEBA_VOCAL_LUCIA" || task.type === "PRUEBA_VOCAL_JOSE_MARIA" || task.type === "ENSAYO_ESTUDIO_7"));
    return coachTasks.every((task) => task.coachId === expectedCoach && (task.type !== "ENSAYO_ESTUDIO_7" || task.blockKey === expectedCoach))
      ? []
      : [issue("COACH_ASSIGNMENT", "COACH_ASSIGNMENT_MISMATCH", participantId, "Coach or main-flow blockKey does not match participant source assignment.")];
  })],
  ["SODEXO_MEALS", (expansion) => PARTICIPANT_IDS.flatMap((participantId) => {
    const sodexoTasks = expansion.tasks.filter((task) => task.participantId === participantId && task.type === "SODEXO");
    const currentIssues: ValidationIssue[] = [];
    if (sodexoTasks.length !== 1) currentIssues.push(issue("SODEXO_MEALS", "SODEXO_CARDINALITY_INVALID", participantId, "Expected exactly one Sodexo per participant."));
    for (const task of sodexoTasks) {
      if (task.duration !== 40) currentIssues.push(issue("SODEXO_MEALS", "SODEXO_DURATION_INVALID", task.id, "Sodexo must last 40 minutes."));
      if (task.operationalKind !== "participant_meal" || task.meal?.occupiesExclusiveSpace !== false) currentIssues.push(issue("SODEXO_MEALS", "SODEXO_SEMANTICS_INVALID", task.id, "Sodexo must be a non-exclusive participant meal obligation."));
    }
    return currentIssues;
  })],
  ["REDES_EXCEPTION", (expansion) => PARTICIPANT_IDS.flatMap((participantId) => {
    const count = expansion.tasks.filter((task) => task.participantId === participantId && task.type === "REDES").length;
    const expected = participantId === "C05" ? 0 : 1;
    return count === expected ? [] : [issue("REDES_EXCEPTION", "REDES_EXCEPTION_INVALID", participantId, "Redes must exist for every participant except C05.")];
  })],
  ["DEPENDENCY_CLOSURE", (expansion) => {
    const taskById = new Map(expansion.tasks.map((task) => [task.id, task]));
    const issues: ValidationIssue[] = [];
    for (const task of expansion.tasks) {
      for (const dependency of task.dependencies) if (!taskById.has(dependency)) issues.push(issue("DEPENDENCY_CLOSURE", "MISSING_DEPENDENCY_REFERENCE", task.id, `Missing dependency ${dependency}.`));
    }
    if (hasCycle(taskById)) issues.push(issue("DEPENDENCY_CLOSURE", "DEPENDENCY_CYCLE", "tasks", "Dependency graph must be acyclic."));
    for (const participantId of PARTICIPANT_IDS) {
      const participantTasks = expansion.tasks.filter((task) => task.participantId === participantId);
      const vocal = participantTasks.find((task) => task.type === "PRUEBA_VOCAL_LUCIA" || task.type === "PRUEBA_VOCAL_JOSE_MARIA");
      const main = participantTasks.find((task) => task.type === "ENSAYO_ESTUDIO_7");
      const exitStyling = participantTasks.find((task) => task.type === "ESTILISMO_SALIDA");
      const out = participantTasks.find((task) => task.type === "OUT");
      const entryStyling = participantTasks.find((task) => task.type === "ESTILISMO_ENTRADA");
      const inTask = participantTasks.find((task) => task.type === "IN");
      if (inTask && inTask.dependencies.length > 0) issues.push(issue("DEPENDENCY_CLOSURE", "IN_HAS_DEPENDENCIES", inTask.id, "IN must not have prerequisites."));
      if (entryStyling && !entryStyling.dependencies.includes(taskId(participantId, "IN"))) issues.push(issue("DEPENDENCY_CLOSURE", "ENTRY_STYLING_DEPENDENCY_LOST", entryStyling.id, "Entry styling must depend on IN."));
      if (vocal && !vocal.dependencies.includes(taskId(participantId, "IN"))) issues.push(issue("DEPENDENCY_CLOSURE", "VOCAL_IN_DEPENDENCY_LOST", vocal.id, "Vocal test must depend on IN."));
      if (main && vocal && !main.dependencies.includes(vocal.id)) issues.push(issue("DEPENDENCY_CLOSURE", "VOCAL_TO_MAIN_DEPENDENCY_LOST", main.id, "Main rehearsal must depend on the correct vocal task."));
      for (const task of participantTasks) {
        if (!["IN", "ESTILISMO_ENTRADA", "PRUEBA_VOCAL_LUCIA", "PRUEBA_VOCAL_JOSE_MARIA"].includes(task.type) && !task.dependencies.includes(taskId(participantId, "ESTILISMO_ENTRADA"))) {
          issues.push(issue("DEPENDENCY_CLOSURE", "ENTRY_STYLING_CLOSURE_LOST", task.id, "Every later obligation must depend on entry styling."));
        }
      }
      if (exitStyling) {
        for (const dependency of participantTasks.filter((task) => task.type !== "ESTILISMO_SALIDA" && task.type !== "OUT")) {
          if (!exitStyling.dependencies.includes(dependency.id)) issues.push(issue("DEPENDENCY_CLOSURE", "EXIT_STYLING_CLOSURE_LOST", exitStyling.id, `Exit styling missing dependency ${dependency.id}.`));
        }
      }
      if (out && exitStyling && !out.dependencies.includes(exitStyling.id)) issues.push(issue("DEPENDENCY_CLOSURE", "OUT_DEPENDENCY_LOST", out.id, "OUT must depend on exit styling."));
      if (out) {
        const closure = transitiveDependencies(taskById, out.id);
        for (const task of participantTasks.filter((entry) => entry.id !== out.id)) {
          if (!closure.has(task.id)) issues.push(issue("DEPENDENCY_CLOSURE", "OUT_TRANSITIVE_CLOSURE_LOST", out.id, `OUT is not transitively after ${task.id}.`));
        }
      }
    }
    return issues;
  }],
  ["ANCHORED_OPERATIONS", (expansion) => expansion.anchoredOperations.flatMap((operation) => {
    const tasks = operation.orderedTaskIds.map((id) => expansion.tasks.find((task) => task.id === id));
    const [before, anchor, after] = tasks;
    const issues: ValidationIssue[] = [];
    if (tasks.some((task) => !task)) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_SEGMENT_OMITTED", operation.id, "Anchored operation is missing one or more segments."));
    if (new Set(operation.orderedTaskIds).size !== 3) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_SEGMENT_DUPLICATED", operation.id, "Anchored operation has duplicate segment ids."));
    if (operation.beforeTaskIds.length !== 1 || operation.afterTaskIds.length !== 1 || operation.anchorTaskId !== taskId(operation.participantId, "ENSAYO_ESTUDIO_7")) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_CONTRACT_INVALID", operation.id, "Anchored contract fields are invalid."));
    if (before && (before.type !== "REALITY_PLATO_ANTES" || before.duration !== 15 || before.participantId !== operation.participantId)) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_BEFORE_INVALID", before.id, "Invalid Reality before segment."));
    if (anchor && (anchor.type !== "ENSAYO_ESTUDIO_7" || anchor.duration !== 15 || anchor.participantId !== operation.participantId)) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_ANCHOR_INVALID", anchor.id, "Invalid anchored main rehearsal."));
    if (after && (after.type !== "REALITY_PLATO_DESPUES" || after.duration !== 15 || after.participantId !== operation.participantId)) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_AFTER_INVALID", after.id, "Invalid Reality after segment."));
    if (anchor && before && !anchor.dependencies.includes(before.id)) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_BEFORE_TO_ANCHOR_DEPENDENCY_LOST", anchor.id, "Anchor must depend on before segment."));
    if (after && anchor && !after.dependencies.includes(anchor.id)) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_ANCHOR_TO_AFTER_DEPENDENCY_LOST", after.id, "After segment must depend on anchor."));
    if (operation.adjacency !== "REQUIRED" || operation.internalTransition !== "INCLUDED" || operation.resourceContinuity !== "REQUIRED") issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_CONTINUITY_CONTRACT_LOST", operation.id, "Anchored operation continuity contract is not exact."));
    return issues;
  })],
  ["JOINT_OPERATIONS", (expansion) => expansion.jointOperations.flatMap((operation) => {
    const tasks = operation.taskIds.map((id) => expansion.tasks.find((task) => task.id === id));
    const issues: ValidationIssue[] = [];
    if (operation.memberParticipantIds.join(",") !== "C06,C10") issues.push(issue("JOINT_OPERATIONS", "JOINT_MEMBER_SET_INVALID", operation.id, "Joint member set must be C06 and C10."));
    if (tasks.some((task) => !task)) issues.push(issue("JOINT_OPERATIONS", "JOINT_MEMBER_TASK_OMITTED", operation.id, "Joint operation is missing a member task."));
    if (tasks.some((task) => task && (task.jointGroupId !== operation.id || task.type !== operation.taskType || task.duration !== operation.duration || task.spaceId !== operation.spaceId))) issues.push(issue("JOINT_OPERATIONS", "JOINT_MEMBER_TASK_INVALID", operation.id, "Joint member task lost id, type, duration or space semantics."));
    if (operation.id === "joint.totales-post.C06-C10") {
      for (const task of tasks) {
        const predecessor = task ? taskId(task.participantId!, "ALFOMBRA_ROJA_CONJUNTA") : "";
        if (task && !task.dependencies.includes(predecessor)) issues.push(issue("JOINT_OPERATIONS", "JOINT_SEQUENCE_DEPENDENCY_LOST", task.id, "Totales Post conjunto must depend on Alfombra Roja conjunta for the same participant."));
      }
    }
    if (operation.synchronizedStartAndEnd !== true) issues.push(issue("JOINT_OPERATIONS", "JOINT_SYNCHRONIZATION_LOST", operation.id, "Joint operation must preserve same future start and end."));
    return issues;
  })],
  ["SETUP_RULES", (expansion) => {
    const setupTasks = expansion.tasks.filter((task) => task.type === "SILLON" || task.type === "ESTRELLAS");
    const issues: ValidationIssue[] = [];
    if (expansion.rules.setup.spaceId !== "p15-estrellas-sillon") issues.push(issue("SETUP_RULES", "SETUP_SPACE_LOST", "rules.setup", "Setup space must be shared by Sillón and Estrellas."));
    if (expansion.rules.setup.reentry !== "FORBIDDEN") issues.push(issue("SETUP_RULES", "SETUP_REENTRY_ALLOWED", "rules.setup.reentry", "Setup reentry must be forbidden."));
    if (expansion.rules.setup.preparationMinutesBetweenFamilies !== 10) issues.push(issue("SETUP_RULES", "SETUP_PREPARATION_CHANGED", "rules.setup.preparationMinutesBetweenFamilies", "Setup preparation must be 10 minutes."));
    if (setupTasks.some((task) => !task.setupFamilyId || task.spaceId !== "p15-estrellas-sillon")) issues.push(issue("SETUP_RULES", "SETUP_FAMILY_LOST", ids(setupTasks).join(","), "Every setup task must keep setupFamilyId and shared space."));
    if (expansion.rules.cornerSetupPolicy.setupRequired !== false || expansion.rules.cornerSetupPolicy.mandatoryGrouping !== false) issues.push(issue("SETUP_RULES", "CORNER_SETUP_POLICY_INVALID", "rules.cornerSetupPolicy", "Corner tasks must not receive setup or mandatory grouping."));
    return issues;
  }],
  ["TOTALES_RULES", (expansion) => {
    const rules = expansion.rules.totalesSynchronization;
    const issues: ValidationIssue[] = [];
    if (rules.synchronizedRounds !== true) issues.push(issue("TOTALES_RULES", "TOTALES_SYNCHRONIZATION_LOST", "rules.totalesSynchronization", "Totales rounds must remain synchronized."));
    if (rules.microphoneChangeMinutesBetweenRounds !== 5 || rules.modelAsSpacePreparationOrTransition !== true) issues.push(issue("TOTALES_RULES", "TOTALES_MICROPHONE_TRANSITION_LOST", "rules.totalesSynchronization", "Five minute microphone change must be modelled as space preparation/transition."));
    return issues;
  }],
  ["COACH_TRANSITION_RULE", (expansion) => expansion.rules.coachTransition.minutes === 30 && expansion.rules.coachTransition.scope === "coach" && expansion.rules.mainFlow.maxBlocksPerCoach === 2 && expansion.rules.mainFlow.continuity === "REQUIRED"
    ? []
    : [issue("COACH_TRANSITION_RULE", "COACH_TRANSITION_RULE_CHANGED", "rules.coachTransition", "Coach transition/main-flow rule changed.")]],
  ["TRANSPORT_RULE", (expansion) => expansion.rules.inTransport.minParticipantsPerGroup === 3 && expansion.rules.inTransport.minMinutesBetweenGroups === 30 && expansion.rules.outTransport === "creation_input_required" && expansion.tasks.filter((task) => task.type === "IN").every((task) => task.operationalKind === "transport_arrival" && task.transport?.direction === "arrival") && expansion.tasks.filter((task) => task.type === "OUT").every((task) => task.operationalKind === "transport_departure" && task.transport?.direction === "departure")
    ? []
    : [issue("TRANSPORT_RULE", "TRANSPORT_RULE_CHANGED", "rules.inTransport", "Transport semantics or IN policy changed.")]],
  ["TECHNICAL_CHAIN", (expansion) => expansion.technicalChains.flatMap((chain) => {
    const chainTasks = chain.orderedTaskIds.map((id) => expansion.tasks.find((task) => task.id === id));
    const issues: ValidationIssue[] = [];
    if (chainTasks.some((task) => !task || task.participantId !== undefined || task.operationalKind !== "technical")) issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_MEMBER_INVALID", chain.id, "Technical chain member missing or attributed to participant."));
    for (const task of chainTasks) {
      if (task && chain.requiredResourceIds.some((resourceId) => !task.requiredResourceIds.includes(resourceId))) issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_RESOURCE_CONTINUITY_LOST", task.id, "Technical chain member lost continuous resources."));
    }
    for (let index = 1; index < chain.orderedTaskIds.length; index += 1) {
      const task = chainTasks[index];
      const previousId = chain.orderedTaskIds[index - 1]!;
      if (task && !task.dependencies.includes(previousId)) issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_DEPENDENCY_LOST", task.id, "Technical chain dependency lost."));
    }
    return issues;
  })],
  ["KNOWN_RESOURCES", (expansion) => {
    const issues: ValidationIssue[] = [];
    const croma = expansion.tasks.filter((task) => task.type === "CROMA");
    if (croma.some((task) => !task.requiredResourceIds.includes("cam-2") || task.requiredResourceIds.includes("son-1"))) issues.push(issue("KNOWN_RESOURCES", "CROMA_RESOURCE_INVALID", ids(croma).join(","), "Croma must keep CAM 2 and no sound."));
    const evaTasks = expansion.tasks.filter((task) => task.type === "ALFOMBRA_ROJA_EVA" || task.type === "REALITY_CONTROL_EVA" || task.type.startsWith("TECH_"));
    if (evaTasks.some((task) => !task.requiredResourceIds.includes("eva"))) issues.push(issue("KNOWN_RESOURCES", "EVA_RESOURCE_LOST", ids(evaTasks).join(","), "EVA tasks must retain EVA resource."));
    const coached = expansion.tasks.filter((task) => task.type === "PRUEBA_VOCAL_LUCIA" || task.type === "PRUEBA_VOCAL_JOSE_MARIA" || task.type === "ENSAYO_ESTUDIO_7");
    if (coached.some((task) => !task.coachId || !task.requiredResourceIds.includes(task.coachId))) issues.push(issue("KNOWN_RESOURCES", "COACH_RESOURCE_LOST", ids(coached).join(","), "Coached tasks must keep effective coach resource."));
    return issues;
  }],
  ["NO_EDITORIAL_OR_SEED", (expansion) => {
    const serialized = JSON.stringify(expansion);
    const forbidden = ["Cristina", "Moisés", "Ángel", "Julio", "José Javier", "Pere", "startPlanned", "endPlanned", "referenceOrder", "NO P.15", "guitarra", "vestuario"];
    const issues: ValidationIssue[] = [];
    for (const value of forbidden) if (serialized.includes(value)) issues.push(issue("NO_EDITORIAL_OR_SEED", "FORBIDDEN_SOURCE_DATA_LEAK", value, `Forbidden value leaked: ${value}.`));
    if (expansion.tasks.some((task) => task.editorialTags.length > 0)) issues.push(issue("NO_EDITORIAL_OR_SEED", "EDITORIAL_CONSTRAINT_LEAK", "editorialTags", "Editorial data became a constraint."));
    return issues;
  }],
];

export function validateExpandedCanonicalFullA2Template(expansion: ExpandedCanonicalFullA2Template): ValidationResult {
  const issueGroups = invariantChecks.map(([code, check]) => [code, check(expansion)] as const);
  const issues = issueGroups.flatMap(([, entries]) => entries);
  const invariants = issueGroups.map(([code, entries]) => invariant(code, entries));
  return deepFreeze({ status: issues.length === 0 ? "VALID" : "INVALID", issues, invariants });
}
