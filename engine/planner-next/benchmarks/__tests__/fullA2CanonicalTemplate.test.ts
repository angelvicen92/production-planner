import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  analyzeCanonicalFullA2Representability,
  canonicalFingerprint,
  createCanonicalFullA2Template,
  expandCanonicalFullA2Template,
  runRepresentabilityGate,
  taskId,
  validateExpandedCanonicalFullA2Template,
  type ExpandedCanonicalFullA2Template,
} from "../focal-a2/full-day/canonicalFullA2Template";

function cloneExpansion(): ExpandedCanonicalFullA2Template {
  return structuredClone(expandCanonicalFullA2Template(createCanonicalFullA2Template())) as ExpandedCanonicalFullA2Template;
}

function assertInvariantFails(mutator: (expansion: any) => void, invariantCode: string, issueCode?: string): void {
  const expansion: any = cloneExpansion();
  mutator(expansion);
  const result = validateExpandedCanonicalFullA2Template(expansion);
  const invariant = result.invariants.find((entry) => entry.code === invariantCode);
  assert.equal(result.status, "INVALID");
  assert.equal(invariant?.passed, false, `Expected invariant ${invariantCode} to fail`);
  if (issueCode) assert.ok(invariant?.issueCodes.includes(issueCode), `Expected ${issueCode}, got ${invariant?.issueCodes.join(",")}`);
}

test("expands exact semantic full A2 template", () => {
  const template = createCanonicalFullA2Template();
  const expansion = expandCanonicalFullA2Template(template);
  const validation = validateExpandedCanonicalFullA2Template(expansion);
  assert.equal(template.participants.join(","), "C01,C02,C03,C04,C05,C06,C07,C08,C09,C10,C11,C12,C13,C14,C15,C16,C17,C18,C19");
  assert.equal(expansion.participants.length, 19);
  assert.equal(expansion.tasks.filter((task) => task.participantId).length, 266);
  assert.equal(expansion.tasks.filter((task) => !task.participantId).length, 3);
  assert.equal(expansion.tasks.length, 269);
  assert.equal(expansion.countsByType.SODEXO, 19);
  assert.equal(expansion.countsByType.REDES, 18);
  assert.equal(expansion.countsByType.SILLON, 9);
  assert.equal(expansion.countsByType.ESTRELLAS, 8);
  assert.equal(expansion.anchoredOperations.length, 3);
  assert.equal(expansion.jointOperations.length, 2);
  assert.equal(expansion.technicalChains.length, 1);
  assert.deepEqual(expansion.itinerantUnits.map((unit) => [unit.id, unit.memberResourceIds]), [["reality-unit-a", ["cam-3", "son-1"]], ["reality-unit-b", ["cam-4", "son-2"]], ["reality-unit-combined", ["cam-3", "cam-4", "son-1"]]]);
  assert.equal(expansion.resources.some((resource) => resource.id === "reality-unit-a"), false);
  assert.equal(expansion.tasks.some((task) => task.requiredResourceIds.includes("reality-unit-a") || task.requiredResourceIds.includes("reality-unit-b") || task.requiredResourceIds.includes("reality-unit-combined")), false);
  assert.equal(validation.status, "VALID", validation.issues.map((issue) => `${issue.code}:${issue.entityId}`).join("\n"));
  assert.ok(validation.invariants.every((entry) => entry.evaluated && entry.passed));
});

test("dependency graph closes all participant obligations before OUT", () => {
  const expansion = expandCanonicalFullA2Template(createCanonicalFullA2Template());
  for (const participantId of expansion.participants) {
    const exitStyling = expansion.tasks.find((task) => task.id === taskId(participantId, "ESTILISMO_SALIDA"))!;
    const participantObligations = expansion.tasks.filter((task) => task.participantId === participantId && task.type !== "ESTILISMO_SALIDA" && task.type !== "OUT");
    assert.deepEqual(exitStyling.dependencies, participantObligations.map((task) => task.id).sort());
    assert.ok(expansion.tasks.find((task) => task.id === taskId(participantId, "OUT"))!.dependencies.includes(exitStyling.id));
  }
});

test("negative mutations fail the targeted invariant families", () => {
  assertInvariantFails((e) => { e.tasks = e.tasks.filter((task: any) => task.id !== taskId("C01", "CROMA")); e.countsByType.CROMA -= 1; }, "PARTICIPANT_TASK_MATRIX", "PARTICIPANT_MATRIX_MISMATCH");
  assertInvariantFails((e) => { e.tasks.push({ ...e.tasks.find((task: any) => task.id === taskId("C01", "CROMA")) }); }, "UNIQUE_TASK_IDS", "DUPLICATE_TASK_ID");
  assertInvariantFails((e) => { e.tasks.find((task: any) => task.id === taskId("C01", "CROMA")).duration = 11; }, "DURATION_CATALOG", "DURATION_CHANGED");
  assertInvariantFails((e) => { e.tasks.find((task: any) => task.id === taskId("C01", "CROMA")).requiredResourceIds.push("son-2"); }, "KNOWN_RESOURCES", "CROMA_RESOURCE_INVALID");
  assertInvariantFails((e) => { e.resources.push({ id: "future-sound", label: "Future Sound", kind: "sound", availability: "creation_input_required" }); e.tasks.find((task: any) => task.id === taskId("C01", "CROMA")).requiredResourceIds.push("future-sound"); }, "KNOWN_RESOURCES", "CROMA_RESOURCE_INVALID");
  assertInvariantFails((e) => { e.technicalChains[0].adjacency = "OFF"; }, "TECHNICAL_CHAIN", "TECHNICAL_CHAIN_CONTRACT_INVALID");
  assertInvariantFails((e) => { e.technicalChains[0].resourceContinuity = "OFF"; }, "TECHNICAL_CHAIN", "TECHNICAL_CHAIN_CONTRACT_INVALID");
  assertInvariantFails((e) => { e.technicalChains[0].orderedTaskIds = ["TECH.tech_desmontaje_traslado", "TECH.tech_reality_eva", "TECH.tech_totales_post"]; }, "TECHNICAL_CHAIN", "TECHNICAL_CHAIN_ORDER_INVALID");
  assertInvariantFails((e) => { e.technicalChains[0].requiredResourceIds = ["cam-3", "cam-4", "son-1"]; }, "TECHNICAL_CHAIN", "TECHNICAL_CHAIN_RESOURCE_SET_INVALID");
  assertInvariantFails((e) => { e.tasks.find((task: any) => task.id === "TECH.tech_desmontaje_traslado").requiredResourceIds.push("son-2"); }, "TECHNICAL_CHAIN", "TECHNICAL_CHAIN_TASK_RESOURCE_SET_INVALID");
  assertInvariantFails((e) => { e.tasks.find((task: any) => task.id === "TECH.tech_reality_eva").duration = 25; }, "TECHNICAL_CHAIN", "TECHNICAL_CHAIN_MEMBER_INVALID");
  assertInvariantFails((e) => { e.itinerantOperations.find((operation: any) => operation.id === "itinerant.reality-unit-b.C05.reality-plato").kind = "standalone"; }, "ITINERANT_UNITS", "ITINERANT_OPERATION_SET_INVALID");
  assertInvariantFails((e) => { e.anchoredOperations = []; }, "ANCHORED_OPERATIONS", "ANCHORED_OPERATION_SET_INVALID");
  assertInvariantFails((e) => { e.anchoredOperations = e.anchoredOperations.filter((operation: any) => operation.participantId !== "C05"); }, "ANCHORED_OPERATIONS", "ANCHORED_OPERATION_SET_INVALID");
  assertInvariantFails((e) => { e.jointOperations = []; }, "JOINT_OPERATIONS", "JOINT_OPERATION_SET_INVALID");
  assertInvariantFails((e) => { e.technicalChains = []; }, "TECHNICAL_CHAIN", "TECHNICAL_CHAIN_SET_INVALID");
  assertInvariantFails((e) => { e.itinerantUnits = []; }, "ITINERANT_UNITS", "ITINERANT_UNIT_SET_INVALID");
  assertInvariantFails((e) => { e.itinerantOperations.find((operation: any) => operation.participantId === "C05").itinerantUnitId = "reality-unit-a"; }, "ITINERANT_UNITS", "ITINERANT_OPERATION_SET_INVALID");
  assertInvariantFails((e) => { const task = e.tasks.find((entry: any) => entry.id === taskId("C10", "REALITY_MANZANO")); task.requiredResourceIds = task.requiredResourceIds.filter((id: string) => id !== "son-2"); }, "ITINERANT_UNITS", "ITINERANT_MEMBER_RESOURCE_LOST");
  assertInvariantFails((e) => { const task = e.tasks.find((entry: any) => entry.id === taskId("C01", "ENSAYO_ESTUDIO_7")); task.requiredResourceIds = task.requiredResourceIds.filter((id: string) => id !== "cam-3"); }, "ITINERANT_UNITS", "ITINERANT_MEMBER_RESOURCE_LOST");
  assertInvariantFails((e) => { e.tasks.find((entry: any) => entry.id === taskId("C01", "REALITY_PLATO_ANTES")).requiredResourceIds.push("reality-unit-a"); }, "ITINERANT_UNITS", "ITINERANT_UNIT_USED_AS_HARD_RESOURCE");
  assertInvariantFails((e) => { e.resources.push({ id: "reality-unit-a", label: "Unit A", kind: "camera", availability: "creation_input_required" }); }, "ITINERANT_UNITS", "ITINERANT_UNIT_REGISTERED_AS_RESOURCE");
  assertInvariantFails((e) => { e.itinerantOperations[1].taskIds = [...e.itinerantOperations[1].taskIds, taskId("C01", "REALITY_PLATO_ANTES")]; }, "ITINERANT_UNITS", "ITINERANT_TASK_ASSIGNED_TO_MULTIPLE_UNITS");
  assertInvariantFails((e) => { e.tasks.find((task: any) => task.id === taskId("C02", "SILLON")).setupFamilyId = "estrellas"; }, "SETUP_RULES", "SETUP_FAMILY_MISMATCH");
  assertInvariantFails((e) => { e.tasks.find((task: any) => task.id === taskId("C05", "CORNER_MUSIC")).setupFamilyId = "sillon"; }, "SETUP_RULES", "CORNER_SETUP_POLICY_INVALID");
  assertInvariantFails((e) => { e.rules.setup.orderConstraint = "SILLON_FIRST"; }, "SETUP_RULES", "SETUP_ORDER_HARD_CODED");
  assertInvariantFails((e) => { e.rules.setup.oneBlockPerFamily = false; }, "SETUP_RULES", "SETUP_ONE_BLOCK_POLICY_LOST");
  assertInvariantFails((e) => { e.tasks = e.tasks.filter((task: any) => task.id !== taskId("C02", "CROMA")); }, "COUNTS_BY_TYPE", "COUNT_BY_TYPE_MISMATCH");
  assertInvariantFails((e) => { e.tasks.filter((task: any) => task.participantId === "C01" && task.coachId).forEach((task: any) => { task.coachId = "coach-jose-maria"; task.requiredResourceIds = ["coach-jose-maria"]; }); e.tasks.filter((task: any) => task.participantId === "C05" && task.coachId).forEach((task: any) => { task.coachId = "coach-lucia"; task.requiredResourceIds = ["coach-lucia"]; }); }, "COACH_ASSIGNMENT", "COACH_ASSIGNMENT_MISMATCH");
  assertInvariantFails((e) => { const exit = e.tasks.find((task: any) => task.id === taskId("C06", "ESTILISMO_SALIDA")); exit.dependencies = exit.dependencies.filter((id: string) => id !== taskId("C06", "REALITY_HALL")); }, "DEPENDENCY_CLOSURE", "EXIT_STYLING_CLOSURE_LOST");
  assertInvariantFails((e) => { const main = e.tasks.find((task: any) => task.id === taskId("C01", "ENSAYO_ESTUDIO_7")); main.dependencies = main.dependencies.filter((id: string) => id !== taskId("C01", "PRUEBA_VOCAL_LUCIA")); }, "DEPENDENCY_CLOSURE", "VOCAL_TO_MAIN_DEPENDENCY_LOST");
  assertInvariantFails((e) => { const main = e.tasks.find((task: any) => task.id === taskId("C01", "ENSAYO_ESTUDIO_7")); main.dependencies = main.dependencies.filter((id: string) => id !== taskId("C01", "REALITY_PLATO_ANTES")); }, "ANCHORED_OPERATIONS", "ANCHORED_BEFORE_TO_ANCHOR_DEPENDENCY_LOST");
  assertInvariantFails((e) => { const after = e.tasks.find((task: any) => task.id === taskId("C01", "REALITY_PLATO_DESPUES")); after.dependencies = after.dependencies.filter((id: string) => id !== taskId("C01", "ENSAYO_ESTUDIO_7")); }, "ANCHORED_OPERATIONS", "ANCHORED_ANCHOR_TO_AFTER_DEPENDENCY_LOST");
  assertInvariantFails((e) => { const post = e.tasks.find((task: any) => task.id === taskId("C06", "TOTALES_POST_CONJUNTO")); post.dependencies = post.dependencies.filter((id: string) => id !== taskId("C06", "ALFOMBRA_ROJA_CONJUNTA")); }, "JOINT_OPERATIONS", "JOINT_SEQUENCE_DEPENDENCY_LOST");
  assertInvariantFails((e) => { e.jointOperations[0].memberParticipantIds = ["C06", "C11"]; }, "JOINT_OPERATIONS", "JOINT_MEMBER_SET_INVALID");
  assertInvariantFails((e) => { e.tasks.find((task: any) => task.id === taskId("C02", "SILLON")).setupFamilyId = undefined; }, "SETUP_RULES", "SETUP_FAMILY_MISMATCH");
  assertInvariantFails((e) => { e.rules.setup.reentry = "ALLOWED"; }, "SETUP_RULES", "SETUP_REENTRY_ALLOWED");
  assertInvariantFails((e) => { e.rules.setup.preparationMinutesBetweenFamilies = 5; }, "SETUP_RULES", "SETUP_PREPARATION_CHANGED");
  assertInvariantFails((e) => { e.rules.totalesSynchronization.synchronizedRounds = false; }, "TOTALES_RULES", "TOTALES_SYNCHRONIZATION_LOST");
  assertInvariantFails((e) => { e.rules.coachTransition.minutes = 15; }, "COACH_TRANSITION_RULE", "COACH_TRANSITION_RULE_CHANGED");
  assertInvariantFails((e) => { e.rules.inTransport.minParticipantsPerGroup = 2; }, "TRANSPORT_RULE", "TRANSPORT_RULE_CHANGED");
  assertInvariantFails((e) => { e.tasks.find((task: any) => task.id === "TECH.tech_desmontaje_traslado").requiredResourceIds = ["cam-3", "cam-4", "eva"]; }, "TECHNICAL_CHAIN", "TECHNICAL_CHAIN_TASK_RESOURCE_SET_INVALID");
  assertInvariantFails((e) => { const sodexo = e.tasks.find((task: any) => task.id === taskId("C01", "SODEXO")); sodexo.operationalKind = "auxiliary"; sodexo.meal.occupiesExclusiveSpace = true; }, "SODEXO_MEALS", "SODEXO_SEMANTICS_INVALID");
  assertInvariantFails((e) => { (e as any).leakedName = "Cristina Zuloaga"; }, "NO_EDITORIAL_OR_SEED", "FORBIDDEN_SOURCE_DATA_LEAK");
  assertInvariantFails((e) => { (e.tasks[0] as any).startPlanned = "09:00"; }, "NO_EDITORIAL_OR_SEED", "FORBIDDEN_SOURCE_DATA_LEAK");
});

test("deterministic, order-invariant, immutable and anonymous", () => {
  const template = createCanonicalFullA2Template();
  const expansion = expandCanonicalFullA2Template(template);
  const shuffled = expandCanonicalFullA2Template({ ...template, participants: [...template.participants].reverse(), assignments: [...template.assignments].reverse(), spaces: [...template.spaces].reverse(), resources: [...template.resources].reverse() });
  assert.equal(canonicalFingerprint(expansion), canonicalFingerprint(expandCanonicalFullA2Template(createCanonicalFullA2Template())));
  assert.equal(canonicalFingerprint(expansion), canonicalFingerprint(shuffled));
  assert.throws(() => { (expansion.tasks as any).push({}); });
  const serialized = JSON.stringify(expansion);
  for (const forbidden of ["Cristina Zuloaga", "Moisés Salazar Ramírez", "Ángel González", "Carmen María Saborido", "Julio Gómez", "Lina Isabel García-Salcedo", "Naomi Inés Carretero", "José Javier Cuenca", "Luis Belda", "Gisela Montserrat", "Linet Varela", "Marta Fornali", "Eva Martín Fernández", "Noa Marcos Díez", "Claudia Torrent", "Adrián Darrel", "Nela García", "Daniel Hernán Barres", "Pere Portero", "startPlanned", "endPlanned", "referenceOrder", "NO P.15", "guitarra", "vestuario"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("representability separates source configuration, implementation blockers and blocks partial execution", () => {
  const expansion = expandCanonicalFullA2Template(createCanonicalFullA2Template());
  const analysis = analyzeCanonicalFullA2Representability(expansion);
  let callCount = 0;
  const gate = runRepresentabilityGate(analysis, () => { callCount += 1; throw new Error("executor must not be called"); });
  assert.equal(analysis.status, "BLOCKED");
  assert.ok(analysis.requiredCreationInputs.every((blocker) => blocker.layer === "SOURCE_CONFIGURATION"));
  assert.equal(analysis.jointGroupProbe.executed, true);
  assert.equal(analysis.jointGroupProbe.engineInputPreflightSupported, true);
  assert.equal(analysis.jointGroupProbe.adapterSupported, true);
  assert.equal(analysis.jointGroupProbe.plannerNextPreflightSupported, true);
  assert.equal(analysis.jointGroupProbe.dependenciesPreserved, true);
  assert.equal(analysis.jointGroupProbe.firstGroupSynchronized, true);
  assert.equal(analysis.jointGroupProbe.secondGroupSynchronized, true);
  assert.equal(analysis.jointGroupProbe.sequencePreserved, true);
  assert.equal(analysis.jointGroupProbe.complete, true);
  assert.equal(analysis.jointGroupProbe.hardValid, true);
  assert.equal(analysis.jointGroupProbe.jointGroupViolationCount, 0);
  assert.equal(analysis.jointGroupProbe.deterministic, true);
  assert.equal(analysis.jointGroupProbe.orderInvariant, true);
  assert.equal(analysis.jointGroupProbe.inputImmutable, true);
  assert.equal(analysis.jointGroupCapabilityProven, true);
  assert.ok(!analysis.implementationBlockers.some((blocker) => blocker.code === "ENGINE_INPUT_JOINT_GROUP_NOT_PROJECTED"));
  assert.ok(!analysis.implementationBlockers.some((blocker) => blocker.code === "PLANNER_NEXT_DEPENDENT_JOINT_GROUP_UNSUPPORTED"));
  assert.equal(analysis.setupPolicyCapabilityProven, true);
  assert.ok(!analysis.implementationBlockers.some((blocker) => blocker.code === "ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED"));
  assert.ok(!analysis.implementationBlockers.some((blocker) => blocker.code === "ADAPTER_COACH_ROUTE_TRANSITION_SCOPE_LOSS"));
  assert.ok(analysis.implementationBlockers.some((blocker) => blocker.code === "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED"));
  assert.ok(!analysis.implementationBlockers.some((blocker) => blocker.code === "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED"));
  assert.equal(analysis.adapterProbe.projectedGlobalResourceTransitionMinutes, 5);
  assert.equal(analysis.adapterProbe.supportsSpecificCoachRouteTransition, true);
  assert.equal(analysis.nextImplementationBlocker?.code, "PLANNER_NEXT_TOTALES_ROUND_SYNC_UNSUPPORTED");

  const failedRouteAnalysis = analyzeCanonicalFullA2Representability(expansion, {
    adapterProbe: {
      ...analysis.adapterProbe,
      supportsSpecificCoachRouteTransition: false,
      problemHasRouteSpecificCoachTransition: false,
      coachResourcesHaveOriginDestinationRule: false,
    },
    jointGroupProbe: analysis.jointGroupProbe,
    setupPolicyProbe: analysis.setupPolicyProbe,
  });
  assert.ok(failedRouteAnalysis.implementationBlockers.some((blocker) => blocker.code === "ADAPTER_COACH_ROUTE_TRANSITION_SCOPE_LOSS"));
  assert.equal(failedRouteAnalysis.nextImplementationBlocker?.code, "ADAPTER_COACH_ROUTE_TRANSITION_SCOPE_LOSS");

  const failedSetupAnalysis = analyzeCanonicalFullA2Representability(
    expansion,
    {
      jointGroupProbe: analysis.jointGroupProbe,
      setupPolicyProbe: {
        ...analysis.setupPolicyProbe,
        complete: false,
      },
    },
  );

  assert.equal(
    failedSetupAnalysis.setupPolicyCapabilityProven,
    false,
  );

  assert.ok(
    failedSetupAnalysis.implementationBlockers.some(
      (blocker) =>
        blocker.code === "ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED",
    ),
  );

  assert.equal(
    failedSetupAnalysis.nextImplementationBlocker?.code,
    "ENGINE_INPUT_SETUP_POLICY_NOT_PROJECTED",
  );

  assert.equal(gate.status, "REJECTED_BLOCKED");
  assert.equal(gate.executorCallCount, 0);
  assert.equal(callCount, 0);
  assert.equal(gate.engineInputBuilt, false);
  assert.equal(gate.preflightCalled, false);
  assert.equal(gate.adapterCalled, false);
  assert.equal(gate.executePlannerNextCalled, false);
});

test("representability keeps dependent joint group blocker when the connected probe fails", () => {
  const expansion = expandCanonicalFullA2Template(createCanonicalFullA2Template());
  const failingProbe = {
    executed: true as const,
    engineInputPreflightSupported: true,
    adapterSupported: true,
    plannerNextPreflightSupported: true,
    sourceGroupCount: 2,
    projectedGroupCount: 2,
    projectedMemberCount: 4,
    dependenciesPreserved: true,
    firstGroupSynchronized: true,
    secondGroupSynchronized: true,
    sequencePreserved: true,
    complete: false,
    hardValid: false,
    jointGroupViolationCount: 1,
    deterministic: true,
    orderInvariant: true,
    inputImmutable: true,
    canonicalIds: ["joint-group:a2-c06-c10-alfombra-roja", "joint-group:a2-c06-c10-totales-post"],
  };
  const analysis = analyzeCanonicalFullA2Representability(expansion, { jointGroupProbe: failingProbe });
  assert.equal(analysis.jointGroupCapabilityProven, false);
  assert.ok(analysis.implementationBlockers.some((blocker) => blocker.code === "PLANNER_NEXT_DEPENDENT_JOINT_GROUP_UNSUPPORTED"));
  assert.equal(analysis.nextImplementationBlocker?.code, "PLANNER_NEXT_DEPENDENT_JOINT_GROUP_UNSUPPORTED");
});

test("generated artifacts are reproducible against current expansion", () => {
  const evidence = JSON.parse(readFileSync("docs/evidence/SPEC10-016-full-a2-canonical-template.json", "utf8"));
  assert.equal(evidence.totalTaskCount, 269);
  assert.equal(evidence.expansionFingerprint, canonicalFingerprint(expandCanonicalFullA2Template(createCanonicalFullA2Template())));
  assert.equal(evidence.representabilityGate.executorCallCount, 0);
  assert.equal(evidence.noEngineInputPartial, true);
  assert.equal(evidence.itinerantUnits.length, 3);
  assert.equal(evidence.unitIdNotHardResource, true);
});
