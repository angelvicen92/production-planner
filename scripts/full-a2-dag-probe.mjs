import fs from "node:fs";
import { execFileSync } from "node:child_process";

const files = [
  "engine/planner-next/contracts.ts",
  "engine/planner-next/integration/flexibleParticipantMealTasks.ts",
  "engine/planner-next/integration/engineInputAdapter.ts",
  "engine/planner-next/placement.ts",
  "engine/planner-next/participantMeals.ts",
  "engine/planner-next/validate.ts",
  "engine/planner-next/exactMainAndFeederCore.ts",
  "engine/planner-next/exactItinerantPlan.ts",
  "engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts",
];

const originals = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));

function update(file, transform) {
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`Probe transform produced no change: ${file}`);
  fs.writeFileSync(file, after);
}

function replaceOnce(text, oldValue, newValue, label) {
  const index = text.indexOf(oldValue);
  if (index < 0) throw new Error(`Probe anchor not found: ${label}`);
  if (text.indexOf(oldValue, index + oldValue.length) >= 0) throw new Error(`Probe anchor is not unique: ${label}`);
  return text.slice(0, index) + newValue + text.slice(index + oldValue.length);
}

function run(command, args, options = {}) {
  console.log(`\n===== ${options.label ?? [command, ...args].join(" ")} =====`);
  execFileSync(command, args, { stdio: "inherit", ...options.exec });
}

try {
  update("engine/planner-next/contracts.ts", (text) => replaceOnce(
    text,
    `  status: "pending" | "interrupted" | "done" | "in_progress";\n  fixedInterval?: Window;`,
    `  status: "pending" | "interrupted" | "done" | "in_progress";\n  /** Canonical predecessor identities; may reference tasks or other participant-meal sourceTaskIds. */\n  dependencies?: string[];\n  fixedInterval?: Window;`,
    "participant meal dependencies contract",
  ));

  update("engine/planner-next/integration/flexibleParticipantMealTasks.ts", (text) => replaceOnce(
    text,
    `    obligations.push({ id: \`participant-meal:\${task.id}\`, sourceTaskId: \`task:\${task.id}\`, participantId: \`participant:\${task.contestantId}\`, duration: duration!, window, status: task.status as ParticipantMealObligation["status"], ...(fixedInterval ? { fixedInterval } : {}) });`,
    `    const dependencies = [...new Set(task.dependsOnTaskIds ?? (task.dependsOnTaskId != null ? [task.dependsOnTaskId] : []))]\n      .sort((a, b) => a - b)\n      .map((id) => \`task:\${id}\`);\n    obligations.push({ id: \`participant-meal:\${task.id}\`, sourceTaskId: \`task:\${task.id}\`, participantId: \`participant:\${task.contestantId}\`, duration: duration!, window, status: task.status as ParticipantMealObligation["status"], dependencies, ...(fixedInterval ? { fixedInterval } : {}) });`,
    "project meal dependencies",
  ));

  update("engine/planner-next/integration/engineInputAdapter.ts", (text) => replaceOnce(
    text,
    `    ...(problem.participantMeals ? { participantMeals: sorted(problem.participantMeals, (entry) => \`\${entry.participantId}\\0\${entry.sourceTaskId}\`) } : {}),`,
    `    ...(problem.participantMeals ? { participantMeals: sorted(problem.participantMeals, (entry) => \`\${entry.participantId}\\0\${entry.sourceTaskId}\`).map((entry) => ({ ...entry, ...(entry.dependencies ? { dependencies: [...entry.dependencies].sort(compare) } : {}) })) } : {}),`,
    "participant meal fingerprint dependencies",
  ));

  update("engine/planner-next/placement.ts", (text) => {
    text = replaceOnce(
      text,
      `/** The single hard-placement predicate used by every Planner Next phase. */`,
      `/** Enforces every precedence relation whose opposite endpoint is already scheduled.\n * Search order is not temporal order, so predecessor and dependent checks are both required. */\nexport function taskRespectsScheduledDependencies(task: Task, start: number, placed: ScheduledTask[]): boolean {\n  const end = start + task.duration;\n  const placedById = new Map(placed.map((item) => [item.id, item]));\n  for (const dependencyId of task.dependencies) {\n    const dependency = placedById.get(dependencyId);\n    if (dependency && dependency.end > start) return false;\n  }\n  for (const dependent of placed) {\n    if (dependent.dependencies.includes(task.id) && end > dependent.start) return false;\n  }\n  return true;\n}\n\n/** The single hard-placement predicate used by every Planner Next phase. */`,
      "dependency placement helper",
    );
    return replaceOnce(
      text,
      `|| !taskFitsAvailability(task,start,end)||!taskAvoidsItinerantUnitMeals(problem,task,start,end)) return false;`,
      `|| !taskFitsAvailability(task,start,end)||!taskAvoidsItinerantUnitMeals(problem,task,start,end)||!taskRespectsScheduledDependencies(task,start,placed)) return false;`,
      "dependency placement call",
    );
  });

  update("engine/planner-next/participantMeals.ts", (text) => {
    text = replaceOnce(
      text,
      `  const ownTasks = tasks.filter((task) => task.participantId === obligation.participantId);\n  const ownMeals = placed.filter((meal) => meal.participantId === obligation.participantId);\n  const result: ScheduledParticipantMeal[] = [];`,
      `  const ownTasks = tasks.filter((task) => task.participantId === obligation.participantId);\n  const ownMeals = placed.filter((meal) => meal.participantId === obligation.participantId);\n  const taskById = new Map(tasks.map((task) => [task.id, task]));\n  const mealBySourceTaskId = new Map(placed.map((meal) => [meal.sourceTaskId, meal]));\n  const obligationBySourceTaskId = new Map((problem.participantMeals ?? []).map((meal) => [meal.sourceTaskId, meal]));\n  const result: ScheduledParticipantMeal[] = [];`,
      "meal dependency lookup maps",
    );
    return replaceOnce(
      text,
      `    if (end > obligation.window.end || !contains(participant.availability, start, end)) continue;\n    if (ownTasks.some((task) => overlaps(task, candidate)) || ownMeals.some((meal) => intervalOverlaps(meal, candidate))) continue;`,
      `    if (end > obligation.window.end || !contains(participant.availability, start, end)) continue;\n    if ((obligation.dependencies ?? []).some((dependencyId) => {\n      const dependencyTask = taskById.get(dependencyId);\n      if (dependencyTask) return dependencyTask.end > start;\n      const dependencyMeal = mealBySourceTaskId.get(dependencyId);\n      return dependencyMeal ? dependencyMeal.end > start : false;\n    })) continue;\n    if (tasks.some((task) => task.dependencies.includes(obligation.sourceTaskId) && end > task.start)) continue;\n    if (placed.some((meal) => (obligationBySourceTaskId.get(meal.sourceTaskId)?.dependencies ?? []).includes(obligation.sourceTaskId) && end > meal.start)) continue;\n    if (ownTasks.some((task) => overlaps(task, candidate)) || ownMeals.some((meal) => intervalOverlaps(meal, candidate))) continue;`,
      "meal precedence candidate checks",
    );
  });

  update("engine/planner-next/validate.ts", (text) => {
    text = replaceOnce(
      text,
      `  const mainSpaceId = problem.mainFlow?.spaceId;\n  const participantMeals = Array.isArray(problem.participantMeals) ? problem.participantMeals : [];\n  if (hasDuplicateIds(participantMeals)) reasons.add("DUPLICATE_PARTICIPANT_MEAL_ID");`,
      `  const mainSpaceId = problem.mainFlow?.spaceId;\n  const participantMeals = Array.isArray(problem.participantMeals) ? problem.participantMeals : [];\n  const participantMealSourceTaskIds = new Set(participantMeals.map((meal) => meal.sourceTaskId));\n  const dependencyIds = new Set([...taskIds, ...participantMealSourceTaskIds]);\n  if (hasDuplicateIds(participantMeals)) reasons.add("DUPLICATE_PARTICIPANT_MEAL_ID");\n  if ([...participantMealSourceTaskIds].some((id) => taskIds.has(id))) reasons.add("PARTICIPANT_MEAL_IDENTITY_CONFLICT");`,
      "preflight dependency identity universe",
    );
    text = replaceOnce(
      text,
      `  for (const meal of participantMeals) {\n    if (!participantIds.has(meal.participantId)) reasons.add("MISSING_PARTICIPANT_REFERENCE");`,
      `  for (const meal of participantMeals) {\n    if (!participantIds.has(meal.participantId)) reasons.add("MISSING_PARTICIPANT_REFERENCE");\n    const dependencies = Array.isArray(meal.dependencies) ? meal.dependencies : [];\n    if ((meal.dependencies !== undefined && !Array.isArray(meal.dependencies))\n      || new Set(dependencies).size !== dependencies.length\n      || dependencies.some((id) => typeof id !== "string" || id === meal.sourceTaskId || !dependencyIds.has(id))) reasons.add("MISSING_TASK_REFERENCE");`,
      "participant meal dependency preflight",
    );
    text = replaceOnce(
      text,
      `    if (!Array.isArray(task.dependencies)\n      || task.dependencies.some((dependencyId) => !taskIds.has(dependencyId))) {`,
      `    if (!Array.isArray(task.dependencies)\n      || task.dependencies.some((dependencyId) => !dependencyIds.has(dependencyId))) {`,
      "task dependency meal identity support",
    );
    text = replaceOnce(
      text,
      `      const isTransportTask = problem.transportPolicy !== undefined\n        && (problem.transportPolicy.arrival.taskIds.includes(task.id) || problem.transportPolicy.departure.taskIds.includes(task.id));\n      if (!Array.isArray(task.dependencies) || (task.jointGroupId === undefined && !isTransportTask && task.dependencies.length > 0)) reasons.add("AUXILIARY_DEPENDENCY_UNSUPPORTED");\n`,
      ``,
      "remove auxiliary dependency rejection",
    );
    text = replaceOnce(
      text,
      `    if (main.dependencies.length !== 1 || main.dependencies[0] !== vocal.id) {\n      reasons.add("UNSUPPORTED_MAIN_DEPENDENCIES");\n    }\n`,
      ``,
      "remove extra main dependency rejection",
    );
    text = replaceOnce(
      text,
      `  const publishedResourceMeals=resourceMeals;\n  const byId = new Map(scheduled.map((task) => [task.id, task]));`,
      `  const publishedResourceMeals=resourceMeals;\n  const byId = new Map(scheduled.map((task) => [task.id, task]));\n  const participantMealBySourceTaskId = new Map(participantMeals.map((meal) => [meal.sourceTaskId, meal]));`,
      "validation meal lookup",
    );
    text = replaceOnce(
      text,
      `    for (const dependencyId of task.dependencies) {\n      const feeder = byId.get(dependencyId);\n      if (!feeder || feeder.end > task.start) dependency += 1;\n    }\n  }`,
      `    for (const dependencyId of task.dependencies) {\n      const feeder = byId.get(dependencyId);\n      const meal = participantMealBySourceTaskId.get(dependencyId);\n      if ((!feeder && !meal) || (feeder ? feeder.end : meal!.end) > task.start) dependency += 1;\n    }\n  }\n  for (const meal of participantMeals) {\n    const obligation = problem.participantMeals?.find((item) => item.sourceTaskId === meal.sourceTaskId);\n    for (const dependencyId of obligation?.dependencies ?? []) {\n      const taskDependency = byId.get(dependencyId);\n      const mealDependency = participantMealBySourceTaskId.get(dependencyId);\n      if ((!taskDependency && !mealDependency) || (taskDependency ? taskDependency.end : mealDependency!.end) > meal.start) dependency += 1;\n    }\n  }`,
      "validation dependencies across tasks and meals",
    );
    return text;
  });

  update("engine/planner-next/exactMainAndFeederCore.ts", (text) => {
    text = replaceOnce(text, `  const arrivalTaskIds = new Set(problem.transportPolicy?.arrival.taskIds ?? []);\n`, ``, "remove arrival-only feeder dependency set");
    text = replaceOnce(
      text,
      `    else if (!main.dependencies.includes(matching[0]!.id)\n      || matching[0]!.dependencies.some((dependencyId) => !arrivalTaskIds.has(dependencyId)))\n      unsupported.push(\`UNSUPPORTED_FEEDER_DEPENDENCY:\${main.id}\`);\n    else feederByMain.set(main.id, { ...matching[0]!, dependencies: matching[0]!.dependencies.filter((id) => !arrivalTaskIds.has(id)) });`,
      `    else if (!main.dependencies.includes(matching[0]!.id))\n      unsupported.push(\`UNSUPPORTED_FEEDER_DEPENDENCY:\${main.id}\`);\n    else feederByMain.set(main.id, { ...matching[0]!, dependencies: [...matching[0]!.dependencies] });`,
      "allow general feeder dependencies",
    );
    return replaceOnce(
      text,
      `        dependencies: task.kind === "vocal"\n          ? task.dependencies.filter((dependencyId) => !arrivalTaskIds.has(dependencyId))\n          : [...task.dependencies],`,
      `        dependencies: task.dependencies.filter((dependencyId) => coreIds.has(dependencyId)),`,
      "core-only leaf validation dependencies",
    );
  });

  update("engine/planner-next/exactItinerantPlan.ts", (text) => {
    text = replaceOnce(
      text,
      `  const setupTaskIds = new Set(pending.filter((task) => task.setupFamilyId !== undefined).map(({ id }) => id));\n  const departureIds = new Set(problem.transportPolicy?.departure.taskIds ?? []);\n  const departureDependencyIds = new Set(problem.tasks.filter(({ id }) => !departureIds.has(id)).map(({ id }) => id));`,
      `  void coreIds;`,
      "remove standalone dependency shape sets",
    );
    return replaceOnce(
      text,
      `    const allowedDependencies = departureIds.has(task.id)\n      ? departureDependencyIds\n      : isSetupTask\n      ? new Set([...coreIds, ...setupTaskIds])\n      : coreIds;\n    if (task.dependencies.some((id) => !allowedDependencies.has(id)))\n      reasons.push(\`UNSUPPORTED_STANDALONE_DEPENDENCY:\${task.id}\`);\n`,
      ``,
      "remove standalone dependency rejection",
    );
  });

  update("engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts", (text) => replaceOnce(
    text,
    `    contestantId: participant,\n    spaceId: spaceId.get(task.spaceId)!,\n    zoneId: zoneId.get(task.spaceId)!,\n    plannerNextKind,`,
    `    contestantId: participant,\n    ...(isMeal ? {} : {\n      spaceId: spaceId.get(task.spaceId)!,\n      zoneId: zoneId.get(task.spaceId)!,\n    }),\n    plannerNextKind,`,
    "participant meal must not occupy space",
  ));

  run("npm", ["run", "check"], { label: "TYPESCRIPT" });
  run("npx", ["tsx", "engine/planner-next/benchmarks/runFullA2FirstExecutionBenchmark.ts"], { label: "FULL A2" });

  const evidencePath = "docs/evidence/A2-FULL-EXEC-001-first-execution.json";
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  console.log("\n===== FULL_A2_EXEC_RESULT =====");
  console.log(JSON.stringify({
    preflight: { status: evidence.preflight?.status, reasonCodes: evidence.preflight?.reasonCodes, issues: evidence.preflight?.issues },
    adapter: { status: evidence.adapter?.status, reasonCodes: evidence.adapter?.reasonCodes, issues: evidence.adapter?.issues },
    execution: evidence.execution,
    result: evidence.result,
  }, null, 2));
} finally {
  for (const [file, content] of originals) fs.writeFileSync(file, content);
  console.log("\n===== RESTORED =====");
  console.log("All probe source edits restored. The generated Evidence file is intentionally preserved.");
}
