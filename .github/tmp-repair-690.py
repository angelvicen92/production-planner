from pathlib import Path

core = Path('engine/planner-next/exactMainAndFeederCore.ts')
text = core.read_text()

anchor = '''const readonlyTaskCopy = <T extends Task | ScheduledTask>(task: T): Readonly<T> => Object.freeze({ ...task,
  dependencies: Object.freeze([...task.dependencies]),
  requiredResourceIds: task.requiredResourceIds === undefined ? undefined : Object.freeze([...task.requiredResourceIds]),
  availability: task.availability === undefined ? undefined : Object.freeze(task.availability.map((window) => Object.freeze({ ...window }))),
}) as Readonly<T>;
'''
helper = anchor + '''
function latestDepartureStartByParticipant(problem: PlannerNextProblem): ReadonlyMap<string, number> {
  const departureIds = new Set(problem.transportPolicy?.departure.taskIds ?? []);
  const latest = new Map<string, number>();
  for (const task of problem.tasks.filter(({ id }) => departureIds.has(id))) {
    if (!task.participantId) continue;
    const participant = problem.participants.find(({ id }) => id === task.participantId);
    const space = problem.spaces.find(({ id }) => id === task.spaceId);
    const resources = (task.requiredResourceIds ?? []).map((id) => problem.resources.find((resource) => resource.id === id));
    const windowSets = [task.availability, participant?.availability, space?.availability,
      ...resources.map((resource) => resource?.availability)]
      .filter((windows): windows is Array<{ start: number; end: number }> => Array.isArray(windows) && windows.length > 0);
    const latestEnd = Math.min(problem.day.end,
      ...windowSets.map((windows) => Math.max(...windows.map(({ end }) => end))));
    const latestStart = latestEnd - task.duration;
    const previous = latest.get(task.participantId);
    latest.set(task.participantId, previous === undefined ? latestStart : Math.min(previous, latestStart));
  }
  return latest;
}
'''
if text.count(anchor) != 1:
  raise SystemExit('readonlyTaskCopy anchor mismatch')
text = text.replace(anchor, helper)

old = '''  const requiredBlocks = buildRequiredCompositeBlocks(problem, mains);
  let selected: { tasks: ScheduledTask[]; meals: ScheduledSpaceMeal[]; pattern: string[]; timeline?: MainFlowTimeline } | null = null;
'''
new = '''  const requiredBlocks = buildRequiredCompositeBlocks(problem, mains);
  const latestDepartureStart = latestDepartureStartByParticipant(problem);
  let selected: { tasks: ScheduledTask[]; meals: ScheduledSpaceMeal[]; pattern: string[]; timeline?: MainFlowTimeline } | null = null;
'''
if text.count(old) != 1:
  raise SystemExit('requiredBlocks anchor mismatch')
text = text.replace(old, new)

old = '''      const operation = materializeAnchoredOperation(problem, task, slot, placed, meals);
      const feeder = feederByMain.get(task.id)!;
      if (!operation) continue;
      const participant = problem.participants.find(({ id }) => id === task.participantId)!;
'''
new = '''      const operation = materializeAnchoredOperation(problem, task, slot, placed, meals);
      const feeder = feederByMain.get(task.id)!;
      if (!operation) continue;
      const departureDeadline = latestDepartureStart.get(task.participantId);
      if (departureDeadline !== undefined && operation.end > departureDeadline) continue;
      const participant = problem.participants.find(({ id }) => id === task.participantId)!;
'''
if text.count(old) != 1:
  raise SystemExit('main choice anchor mismatch')
text = text.replace(old, new)

old = '''        const operation = materializeAnchoredOperation(problem, task, slots[position]!, placed, meals);
        if (!operation) continue;
        positions.push(position);
'''
new = '''        const operation = materializeAnchoredOperation(problem, task, slots[position]!, placed, meals);
        if (!operation) continue;
        const departureDeadline = latestDepartureStart.get(task.participantId);
        if (departureDeadline !== undefined && operation.end > departureDeadline) continue;
        positions.push(position);
'''
if text.count(old) != 1:
  raise SystemExit('residual matching anchor mismatch')
text = text.replace(old, new)

old = '''    const timelines: Array<MainFlowTimeline | undefined> = hasMainFlowMeal(problem)
      ? orderTimelines(candidateCuts(pattern).map((cut) => buildTimeline(problem, pattern, duration, cut))) : [undefined];
    for (const timeline of timelines) {
      if (!consumeBranch("TIMELINE_SEARCH_BUDGET_EXHAUSTED"))
        return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
      evidence.timelineCandidatesExplored += 1;
      const slots = timeline?.slots ?? pattern.map((_, index) => problem.mainFlow.preferredEnd - pattern.length * duration + index * duration);
      for (const composite of positions) {
        if (!consumeBranch("COMPOSITE_POSITION_SEARCH_BUDGET_EXHAUSTED"))
          return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
        const result = search(pattern, slots, composite, timeline ? [timeline.meal] : [], [], new Set(), 0,
          timeline?.key ?? null);
        if (result === "BUDGET_EXHAUSTED")
          return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
        if (result === "FOUND") {
          if (selected) selected.timeline = timeline;
          break outer;
        }
      }
    }
'''
new = '''    const timelines: Array<MainFlowTimeline | undefined> = hasMainFlowMeal(problem)
      ? orderTimelines(candidateCuts(pattern).map((cut) => buildTimeline(problem, pattern, duration, cut))) : [undefined];
    for (const timeline of timelines) {
      const candidateEnds = timeline
        ? [problem.mainFlow.preferredEnd]
        : [...new Set([problem.mainFlow.preferredEnd,
          ...[...latestDepartureStart.values()].map((deadline) => Math.min(problem.mainFlow.preferredEnd, deadline))])]
          .sort((left, right) => right - left);
      for (const candidateEnd of candidateEnds) {
        if (!consumeBranch("TIMELINE_SEARCH_BUDGET_EXHAUSTED"))
          return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
        evidence.timelineCandidatesExplored += 1;
        const slots = timeline?.slots ?? pattern.map((_, index) => candidateEnd - pattern.length * duration + index * duration);
        if (slots.length > 0 && slots[0]! < problem.day.start) continue;
        for (const composite of positions) {
          if (!consumeBranch("COMPOSITE_POSITION_SEARCH_BUDGET_EXHAUSTED"))
            return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
          const result = search(pattern, slots, composite, timeline ? [timeline.meal] : [], [], new Set(), 0,
            timeline?.key ?? null);
          if (result === "BUDGET_EXHAUSTED")
            return fail("BRANCH_BUDGET_EXHAUSTED", [exhaustionReason], coreIds);
          if (result === "FOUND") {
            if (selected) selected.timeline = timeline;
            break outer;
          }
        }
      }
    }
'''
if text.count(old) != 1:
  raise SystemExit('timeline anchor mismatch')
core.write_text(text.replace(old, new))

spec = Path('engine/planner-next/flexibleSetupOrder.spec.ts')
text = spec.read_text()
old = '''test("full A2 retains only the new transport and scoped meal blockers", () => {
  const analysis = analyzeCanonicalFullA2Representability(expandCanonicalFullA2Template(createCanonicalFullA2Template()));
  assert.equal(analysis.implementationBlockers.some((item) => item.code === "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED"), false);
  assert.deepEqual(analysis.implementationBlockers.map((item) => item.code), [
    "PLANNER_NEXT_TRANSPORT_GROUPING_UNSUPPORTED",
    "ENGINE_INPUT_FLEXIBLE_SCOPED_MEAL_POLICY_UNSUPPORTED",
    "PLANNER_NEXT_SCOPED_MEAL_RESOURCE_EXCLUSIVITY_UNSUPPORTED",
  ]);
  assert.equal(analysis.nextImplementationBlocker?.code, "PLANNER_NEXT_TRANSPORT_GROUPING_UNSUPPORTED");
  assert.equal(analysis.nextImplementationBlocker?.layer, "PLANNER_NEXT");
});'''
new = '''test("full A2 retains only scoped meal blockers after transport support", () => {
  const analysis = analyzeCanonicalFullA2Representability(expandCanonicalFullA2Template(createCanonicalFullA2Template()));
  assert.equal(analysis.implementationBlockers.some((item) => item.code === "PLANNER_NEXT_FLEXIBLE_SETUP_ORDER_UNSUPPORTED"), false);
  assert.deepEqual(analysis.implementationBlockers.map((item) => item.code), [
    "ENGINE_INPUT_FLEXIBLE_SCOPED_MEAL_POLICY_UNSUPPORTED",
    "PLANNER_NEXT_SCOPED_MEAL_RESOURCE_EXCLUSIVITY_UNSUPPORTED",
  ]);
  assert.equal(analysis.nextImplementationBlocker?.code, "ENGINE_INPUT_FLEXIBLE_SCOPED_MEAL_POLICY_UNSUPPORTED");
  assert.equal(analysis.nextImplementationBlocker?.layer, "ENGINE_INPUT");
});'''
if text.count(old) != 1:
  raise SystemExit('flexibleSetupOrder expectation anchor mismatch')
spec.write_text(text.replace(old, new))
