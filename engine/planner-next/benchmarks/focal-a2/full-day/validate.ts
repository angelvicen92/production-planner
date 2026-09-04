import { CANONICAL_ITINERANT_OPERATIONS, CANONICAL_ITINERANT_UNITS, EXPECTED_COACH_BY_PARTICIPANT, EXPECTED_COUNTS_BY_TYPE, EXPECTED_PARTICIPANT_TASK_MATRIX, TASK_TYPES } from "./manifest";
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
  ["COUNTS_BY_TYPE", (expansion) => {
    const recomputed = Object.fromEntries(Object.keys(EXPECTED_COUNTS_BY_TYPE).map((type) => [type, 0])) as Record<TaskType, number>;
    for (const task of expansion.tasks) recomputed[task.type] = (recomputed[task.type] ?? 0) + 1;
    return Object.entries(EXPECTED_COUNTS_BY_TYPE).flatMap(([type, expected]) => {
      const actual = recomputed[type as TaskType] ?? 0;
      const derived = expansion.countsByType[type as TaskType] ?? 0;
      const issues: ValidationIssue[] = [];
      if (actual !== expected) issues.push(issue("COUNTS_BY_TYPE", "COUNT_BY_TYPE_MISMATCH", type, `Expected ${expected} tasks of type ${type}, got ${actual}.`));
      if (derived !== actual) issues.push(issue("COUNTS_BY_TYPE", "DERIVED_COUNT_BY_TYPE_STALE", type, `Derived countsByType has ${derived}, recomputed ${actual}.`));
      return issues;
    });
  }],
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
  ["ANCHORED_OPERATIONS", (expansion) => {
    const expectedIds = ["anchored.reality-plato.C01", "anchored.reality-plato.C05", "anchored.reality-plato.C08"];
    const actualIds = expansion.anchoredOperations.map((operation) => operation.id).sort();
    const setIssues: ValidationIssue[] = JSON.stringify(actualIds) === JSON.stringify(expectedIds)
      ? []
      : [issue("ANCHORED_OPERATIONS", "ANCHORED_OPERATION_SET_INVALID", "anchoredOperations", "Anchored operations must be exactly C01, C05 and C08.")];
    return [...setIssues, ...expansion.anchoredOperations.flatMap((operation) => {
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
    const expectedOperation = CANONICAL_ITINERANT_OPERATIONS.find((entry) => entry.kind === "anchored" && entry.participantId === operation.participantId);
    if (!expectedOperation || operation.itinerantUnitId !== expectedOperation.itinerantUnitId || operation.memberResourceIds.join(",") !== expectedOperation.memberResourceIds.join(",")) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_ITINERANT_CONTRACT_INVALID", operation.id, "Anchored operation lost itinerant unit identity or member resources."));
    if (anchor && expectedOperation && expectedOperation.memberResourceIds.some((resourceId) => !anchor.requiredResourceIds.includes(resourceId))) issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_ANCHOR_RESOURCE_CONTINUITY_LOST", anchor.id, "Anchor lost itinerant unit member resources."));
    if (operation.adjacency !== "REQUIRED" || operation.internalTransition !== "INCLUDED" || operation.resourceContinuity !== "REQUIRED") issues.push(issue("ANCHORED_OPERATIONS", "ANCHORED_CONTINUITY_CONTRACT_LOST", operation.id, "Anchored operation continuity contract is not exact."));
    return issues;
  })];
  }],
  ["JOINT_OPERATIONS", (expansion) => {
    const expectedIds = ["joint.alfombra-roja.C06-C10", "joint.totales-post.C06-C10"];
    const actualIds = expansion.jointOperations.map((operation) => operation.id).sort();
    const setIssues: ValidationIssue[] = JSON.stringify(actualIds) === JSON.stringify(expectedIds)
      ? []
      : [issue("JOINT_OPERATIONS", "JOINT_OPERATION_SET_INVALID", "jointOperations", "Joint operations must be exactly Alfombra Roja and Totales Post for C06/C10.")];
    return [...setIssues, ...expansion.jointOperations.flatMap((operation) => {
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
  })];
  }],
  ["SETUP_RULES", (expansion) => {
    const setupTasks = expansion.tasks.filter((task) => task.type === "SILLON" || task.type === "ESTRELLAS");
    const issues: ValidationIssue[] = [];
    if (expansion.rules.setup.spaceId !== "p15-estrellas-sillon") issues.push(issue("SETUP_RULES", "SETUP_SPACE_LOST", "rules.setup", "Setup space must be shared by Sillón and Estrellas."));
    if (expansion.rules.setup.families.join(",") !== "sillon,estrellas") issues.push(issue("SETUP_RULES", "SETUP_FAMILY_SET_INVALID", "rules.setup.families", "Setup families must be Sillón and Estrellas without a hard order."));
    if (expansion.rules.setup.oneBlockPerFamily !== true) issues.push(issue("SETUP_RULES", "SETUP_ONE_BLOCK_POLICY_LOST", "rules.setup.oneBlockPerFamily", "Each setup family must remain a single block."));
    if (expansion.rules.setup.orderConstraint !== "UNSPECIFIED") issues.push(issue("SETUP_RULES", "SETUP_ORDER_HARD_CODED", "rules.setup.orderConstraint", "Setup order must remain unspecified by the source."));
    if (expansion.rules.setup.reentry !== "FORBIDDEN") issues.push(issue("SETUP_RULES", "SETUP_REENTRY_ALLOWED", "rules.setup.reentry", "Setup reentry must be forbidden."));
    if (expansion.rules.setup.preparationMinutesBetweenFamilies !== 10) issues.push(issue("SETUP_RULES", "SETUP_PREPARATION_CHANGED", "rules.setup.preparationMinutesBetweenFamilies", "Setup preparation must be 10 minutes."));
    for (const task of setupTasks) {
      if (task.spaceId !== "p15-estrellas-sillon") issues.push(issue("SETUP_RULES", "SETUP_SPACE_LOST", task.id, "Setup task lost shared setup space."));
      if (task.type === "SILLON" && task.setupFamilyId !== "sillon") issues.push(issue("SETUP_RULES", "SETUP_FAMILY_MISMATCH", task.id, "Sillón must use setupFamilyId sillon."));
      if (task.type === "ESTRELLAS" && task.setupFamilyId !== "estrellas") issues.push(issue("SETUP_RULES", "SETUP_FAMILY_MISMATCH", task.id, "Estrellas must use setupFamilyId estrellas."));
    }
    const cornerTasks = expansion.tasks.filter((task) => task.type === "CORNER_INFLUENCER" || task.type === "CORNER_MUSIC" || task.type === "CORNER_INFLUENCER_MUSIC");
    if (cornerTasks.some((task) => task.setupFamilyId || task.jointGroupId)) issues.push(issue("SETUP_RULES", "CORNER_SETUP_POLICY_INVALID", ids(cornerTasks).join(","), "Corner tasks must not receive setup or mandatory grouping."));
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
  ["SPACE_CAMERA_AUTHORITY", (expansion) => {
    const expected = {
      "p14-recursos": ["cam-1"], "p14-pasillo": ["cam-1"],
      "p15-croma": ["cam-2"], "p15-estrellas-sillon": ["cam-2"],
      "totales-1": ["cam-5"], "totales-coreo": ["cam-6"],
    };
    const camerasPresent = ["cam-1", "cam-2", "cam-4", "cam-5", "cam-6"].every((id) => expansion.resources.some((resource) => resource.id === id));
    const mappingExact = JSON.stringify(expansion.spaceResourceAssignments) === JSON.stringify(expected);
    const noDuplicatedTaskAuthority = expansion.tasks.filter((task) => ["CROMA", "REDES", "PASILLO", "GIRATUTO", "SILLON", "ESTRELLAS", "TOTALES_1", "TOTALES_COREO"].includes(task.type))
      .every((task) => !task.requiredResourceIds.some((id) => ["cam-1", "cam-2", "cam-4", "cam-5", "cam-6"].includes(id)));
    return camerasPresent && mappingExact && noDuplicatedTaskAuthority ? [] : [issue("SPACE_CAMERA_AUTHORITY", "SPACE_CAMERA_AUTHORITY_CHANGED", "spaceResourceAssignments", "A2 camera use must be assigned effectively by canonical space without duplicated task authority.")];
  }],
  ["COACH_TRANSITION_RULE", (expansion) => expansion.rules.coachTransition.minutes === 30 && expansion.rules.coachTransition.scope === "coach" && expansion.rules.mainFlow.blockLimit === "UNBOUNDED" && expansion.rules.mainFlow.continuity === "REQUIRED"
    ? []
    : [issue("COACH_TRANSITION_RULE", "COACH_TRANSITION_RULE_CHANGED", "rules.coachTransition", "Coach transition/main-flow rule changed.")]],
  ["EFFECTIVE_CONFIGURATION", (expansion) => {
    const c = expansion.effectiveConfiguration;
    const availabilityValid = expansion.participants.every((id) => c.participantAvailability[id]?.start === "09:00" && c.participantAvailability[id]?.end === (id === "C01" ? "15:30" : "18:40"));
    const transportValid = c.transportPolicy.arrival.targetGroupSize === 3 && c.transportPolicy.arrival.maximumGroupSize === 6 && c.transportPolicy.arrival.minGapMinutes === 30 && c.transportPolicy.arrival.groupingWeight === 3 && c.transportPolicy.departure.targetGroupSize === 1 && c.transportPolicy.departure.maximumGroupSize === 6 && c.transportPolicy.departure.minGapMinutes === 20 && c.transportPolicy.departure.groupingWeight === 3;
    const mealsValid = c.meals.effectiveWindow.start === "13:00" && c.meals.effectiveWindow.end === "16:30" && c.meals.operational.defaultDurationMinutes === 75 && c.meals.operational.realityDurationMinutes === 75 && c.meals.operational.flexible === true && c.meals.operational.fixedHumanCutIntervals.length === 0 && c.meals.operational.legacyItinerantMealBreakMinutesAuthoritative === false && c.meals.participant.sodexoDurationMinutes === 40 && c.meals.participant.maxSimultaneous === 10 && c.meals.participant.independentFromOperationalMeal === true && c.meals.coach.individualDurationMinutes === 45 && c.meals.coach.inheritsSpaceOperationalMeal === false;
    return availabilityValid && transportValid && mealsValid && expansion.requiredCreationInputs.length === 0 ? [] : [issue("EFFECTIVE_CONFIGURATION", "EFFECTIVE_CONFIGURATION_DRIFT", "effectiveConfiguration", "Resolved A2 source configuration changed or acquired a human fixed meal interval.")];
  }],
  ["TRANSPORT_RULE", (expansion) => expansion.rules.inTransport.targetGroupSize === 3 && expansion.rules.inTransport.maximumGroupSize === 6 && expansion.rules.inTransport.minGapMinutes === 30 && expansion.rules.outTransport.targetGroupSize === 1 && expansion.rules.outTransport.maximumGroupSize === 6 && expansion.rules.outTransport.minGapMinutes === 20 && expansion.tasks.filter((task) => task.type === "IN").every((task) => task.operationalKind === "transport_arrival" && task.transport?.direction === "arrival") && expansion.tasks.filter((task) => task.type === "OUT").every((task) => task.operationalKind === "transport_departure" && task.transport?.direction === "departure")
    ? []
    : [issue("TRANSPORT_RULE", "TRANSPORT_RULE_CHANGED", "rules.inTransport", "Transport semantics or IN policy changed.")]],
  ["TECHNICAL_CHAIN", (expansion) => {
    const expectedIds = ["technical.reality-eva-transfer-totales-post"];
    const expectedOrderedTaskIds = ["TECH.tech_reality_eva", "TECH.tech_desmontaje_traslado", "TECH.tech_totales_post"];
    const expectedResourceIds = ["cam-3", "cam-4", "eva", "son-1"];
    const expectedDurations = [20, 5, 5];
    const actualIds = expansion.technicalChains.map((chain) => chain.id).sort();
    const setIssues: ValidationIssue[] = JSON.stringify(actualIds) === JSON.stringify(expectedIds)
      ? []
      : [issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_SET_INVALID", "technicalChains", "Technical chain set must contain the exact official continuous chain.")];
    return [...setIssues, ...expansion.technicalChains.flatMap((chain) => {
    const chainTasks = chain.orderedTaskIds.map((id) => expansion.tasks.find((task) => task.id === id));
    const issues: ValidationIssue[] = [];
    if (chain.adjacency !== "REQUIRED" || chain.internalTransition !== "INCLUDED" || chain.resourceContinuity !== "REQUIRED") issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_CONTRACT_INVALID", chain.id, "Technical chain must require adjacency, included internal transition and resource continuity."));
    if (JSON.stringify(chain.orderedTaskIds) !== JSON.stringify(expectedOrderedTaskIds)) issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_ORDER_INVALID", chain.id, "Technical chain orderedTaskIds must match the official sequence."));
    if (JSON.stringify([...chain.requiredResourceIds].sort()) !== JSON.stringify(expectedResourceIds)) issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_RESOURCE_SET_INVALID", chain.id, "Technical chain contract resources must be exactly CAM 3, CAM 4, SON 1 and EVA."));
    if (chainTasks.some((task) => !task || task.participantId !== undefined || task.operationalKind !== "technical")) issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_MEMBER_INVALID", chain.id, "Technical chain member missing or attributed to participant."));
    chainTasks.forEach((task, index) => {
      if (!task) return;
      if (task.duration !== expectedDurations[index]) issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_MEMBER_INVALID", task.id, "Technical chain task duration changed."));
      if (JSON.stringify([...task.requiredResourceIds].sort()) !== JSON.stringify(expectedResourceIds)) issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_TASK_RESOURCE_SET_INVALID", task.id, "Technical chain task resources must be exactly CAM 3, CAM 4, SON 1 and EVA."));
    });
    for (let index = 1; index < chain.orderedTaskIds.length; index += 1) {
      const task = chainTasks[index];
      const previousId = chain.orderedTaskIds[index - 1]!;
      if (task && !task.dependencies.includes(previousId)) issues.push(issue("TECHNICAL_CHAIN", "TECHNICAL_CHAIN_DEPENDENCY_LOST", task.id, "Technical chain dependency lost."));
    }
    return issues;
  })];
  }],
  ["ITINERANT_UNITS", (expansion) => {
    const issues: ValidationIssue[] = [];
    const expectedUnitIds = CANONICAL_ITINERANT_UNITS.map((unit) => unit.id).sort();
    const actualUnitIds = expansion.itinerantUnits.map((unit) => unit.id).sort();
    if (JSON.stringify(actualUnitIds) !== JSON.stringify(expectedUnitIds)) issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_SET_INVALID", "itinerantUnits", "Itinerant units must be exactly A, B and combined."));
    const resourceIds = new Set(expansion.resources.map((resource) => resource.id));
    if (!resourceIds.has("son-2")) issues.push(issue("ITINERANT_UNITS", "ITINERANT_RESOURCE_SET_INVALID", "resources.son-2", "SON 2 must be a canonical resource."));
    for (const unit of CANONICAL_ITINERANT_UNITS) {
      const actual = expansion.itinerantUnits.find((entry) => entry.id === unit.id);
      if (!actual || actual.memberResourceIds.join(",") !== unit.memberResourceIds.join(",") || actual.availability !== unit.availability) issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_SET_INVALID", unit.id, "Itinerant unit composition or availability must match SPEC-08."));
    }
    const unitIds = new Set(expectedUnitIds);
    for (const resource of expansion.resources) if (unitIds.has(resource.id)) issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_REGISTERED_AS_RESOURCE", resource.id, "Itinerant unit identity must not be a hard resource."));
    const expectedOperationIds = CANONICAL_ITINERANT_OPERATIONS.map((operation) => operation.id).sort();
    const actualOperationIds = expansion.itinerantOperations.map((operation) => operation.id).sort();
    if (JSON.stringify(actualOperationIds) !== JSON.stringify(expectedOperationIds)) issues.push(issue("ITINERANT_UNITS", "ITINERANT_OPERATION_SET_INVALID", "itinerantOperations", "Itinerant operations must match the official SPEC-08 assignments exactly."));
    const claimedTaskIds = new Map<string, string>();
    for (const operation of expansion.itinerantOperations) {
      const expected = CANONICAL_ITINERANT_OPERATIONS.find((entry) => entry.id === operation.id);
      if (!expected || operation.itinerantUnitId !== expected.itinerantUnitId || operation.participantId !== expected.participantId || operation.memberResourceIds.join(",") !== expected.memberResourceIds.join(",") || operation.taskIds.join(",") !== expected.taskIds.join(",") || operation.kind !== expected.kind) {
        issues.push(issue("ITINERANT_UNITS", "ITINERANT_OPERATION_SET_INVALID", operation.id, "Itinerant operation identity, members or tasks changed."));
      }
      for (const taskIdValue of operation.taskIds) {
        if (claimedTaskIds.has(taskIdValue)) issues.push(issue("ITINERANT_UNITS", "ITINERANT_TASK_ASSIGNED_TO_MULTIPLE_UNITS", taskIdValue, "A task cannot belong to two itinerant units."));
        claimedTaskIds.set(taskIdValue, operation.id);
        const task = expansion.tasks.find((entry) => entry.id === taskIdValue);
        if (!task) {
          issues.push(issue("ITINERANT_UNITS", "ITINERANT_OPERATION_TASK_MISSING", taskIdValue, "Itinerant operation task is missing."));
          continue;
        }
        if (task.itinerantUnitId !== operation.itinerantUnitId) issues.push(issue("ITINERANT_UNITS", "ITINERANT_TASK_UNIT_MISMATCH", task.id, "Task itinerantUnitId does not match explicit operation."));
        for (const resourceId of operation.memberResourceIds) if (!task.requiredResourceIds.includes(resourceId)) issues.push(issue("ITINERANT_UNITS", "ITINERANT_MEMBER_RESOURCE_LOST", task.id, `Task lost itinerant member resource ${resourceId}.`));
      }
    }
    for (const task of expansion.tasks) {
      for (const resourceId of task.requiredResourceIds) if (unitIds.has(resourceId)) issues.push(issue("ITINERANT_UNITS", "ITINERANT_UNIT_USED_AS_HARD_RESOURCE", task.id, "Itinerant unit identity must not be in requiredResourceIds."));
      const evaAllowed = task.type === "ALFOMBRA_ROJA_EVA" || task.type === "REALITY_CONTROL_EVA" || task.type.startsWith("TECH_");
      if (task.requiredResourceIds.includes("eva") && !evaAllowed) issues.push(issue("ITINERANT_UNITS", "EVA_RESOURCE_ON_NON_EVA_TASK", task.id, "EVA must only be added to tasks that explicitly require EVA."));
      if (task.itinerantUnitId && !claimedTaskIds.has(task.id)) issues.push(issue("ITINERANT_UNITS", "ITINERANT_TASK_WITHOUT_EXPLICIT_OPERATION", task.id, "Itinerant task must be assigned through an explicit operation descriptor."));
    }
    return issues;
  }],
  ["KNOWN_RESOURCES", (expansion) => {
    const issues: ValidationIssue[] = [];
    const croma = expansion.tasks.filter((task) => task.type === "CROMA");
    const soundResourceIds = new Set(expansion.resources.filter((resource) => resource.kind === "sound").map((resource) => resource.id));
    if (croma.some((task) => task.requiredResourceIds.includes("cam-2") || task.requiredResourceIds.some((resourceId) => soundResourceIds.has(resourceId))) || expansion.spaceResourceAssignments["p15-croma"]?.join() !== "cam-2") issues.push(issue("KNOWN_RESOURCES", "CROMA_RESOURCE_INVALID", ids(croma).join(","), "Croma must receive CAM 2 from its space and no canonical sound resource."));
    const evaTasks = expansion.tasks.filter((task) => task.type === "ALFOMBRA_ROJA_EVA" || task.type === "REALITY_CONTROL_EVA" || task.type.startsWith("TECH_"));
    if (evaTasks.some((task) => !task.requiredResourceIds.includes("eva"))) issues.push(issue("KNOWN_RESOURCES", "EVA_RESOURCE_LOST", ids(evaTasks).join(","), "EVA tasks must retain EVA resource."));
    const coached = expansion.tasks.filter((task) => task.type === "PRUEBA_VOCAL_LUCIA" || task.type === "PRUEBA_VOCAL_JOSE_MARIA" || task.type === "ENSAYO_ESTUDIO_7");
    if (coached.some((task) => !task.coachId || !task.requiredResourceIds.includes(task.coachId))) issues.push(issue("KNOWN_RESOURCES", "COACH_RESOURCE_LOST", ids(coached).join(","), "Coached tasks must keep effective coach resource."));
    return issues;
  }],
  ["NO_EDITORIAL_OR_SEED", (expansion) => {
    const serialized = JSON.stringify(expansion);
    const forbidden = [
      "Cristina Zuloaga", "Moisés Salazar Ramírez", "Ángel González", "Carmen María Saborido", "Julio Gómez", "Lina Isabel García-Salcedo", "Naomi Inés Carretero", "José Javier Cuenca", "Luis Belda", "Gisela Montserrat", "Linet Varela", "Marta Fornali", "Eva Martín Fernández", "Noa Marcos Díez", "Claudia Torrent", "Adrián Darrel", "Nela García", "Daniel Hernán Barres", "Pere Portero", "startPlanned", "endPlanned", "referenceOrder", "NO P.15", "guitarra", "vestuario"
    ];
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
