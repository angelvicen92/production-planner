import { createHash } from "node:crypto";
import { executePlannerNext } from "../executePlannerNext";
import { scheduleParticipantMeals } from "../participantMeals";
import { participantMealA2Scenario } from "../scenarios/participantMealA2Scenario";
import { validatePlan } from "../validate";

const stable = (value: unknown): string => JSON.stringify(value);
const sha = (value: unknown): string => createHash("sha256").update(stable(value)).digest("hex");
const policies = ["COMPATIBILITY_PRESERVING", "EXACT_CONSTRUCTIVE"] as const;
const executions = policies.map((policy) => {
  const problem = participantMealA2Scenario(policy), snapshot = structuredClone(problem), execution = executePlannerNext(problem), result = execution.result;
  if (!result) throw new Error(`Policy rejected: ${policy}`);
  const meals = result.scheduledParticipantMeals ?? [];
  const validation = validatePlan(problem, result.scheduledTasks, "scheduledSetupPreparations" in result ? result.scheduledSetupPreparations : [], result.scheduledSpaceMeals, meals);
  const witness = scheduleParticipantMeals(problem, result.scheduledTasks);
  return { policy, inputSemanticFingerprint: sha(problem), problemFingerprint: sha(problem), taskIds: problem.participantMeals!.map(x=>x.sourceTaskId), participantIds: problem.participantMeals!.map(x=>x.participantId), durations: Object.fromEntries(problem.participantMeals!.map(x=>[x.sourceTaskId,x.duration])), windows: Object.fromEntries(problem.participantMeals!.map(x=>[x.sourceTaskId,x.window])), capacity: problem.participantMealCapacity!.maxSimultaneous, candidatesByMeal: witness.candidateCountByTaskId, witness: witness.scheduled, selectionOrder: witness.selectionOrder, scheduledParticipantMeals: meals, maximumSimultaneous: witness.maximumSimultaneous, branches: witness.branchesExplored, backtracks: witness.backtracks, complete: result.complete, hardValid: validation.hardValid, reasonCodes: validation.reasonCodes, inputImmutable: stable(problem)===stable(snapshot) };
});
const output = { benchmark: "SPEC10-013R-flexible-participant-meals", executions, deterministic: stable(executions[0]) === stable((()=>{const p=participantMealA2Scenario(policies[0]);const x=executePlannerNext(p).result!;const w=scheduleParticipantMeals(p,x.scheduledTasks);return {...executions[0],witness:w.scheduled,selectionOrder:w.selectionOrder,scheduledParticipantMeals:x.scheduledParticipantMeals??[],branches:w.branchesExplored,backtracks:w.backtracks};})()) };
process.stdout.write(JSON.stringify(output,null,2)+"\n");
