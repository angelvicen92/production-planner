/** Isolate logical setup state from temporal continuity on the native problem. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createPlanningScope,buildAssistedProblem,executeAssistedPlanning} from '../../../engine/planner-next/assistedPlanning';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {generateExactSetupBlockCandidates} from '../../../engine/planner-next/exactSetupBlocks';
import {generateBlockCandidates} from '../../../engine/planner-next/placeAuxiliaryTasks';
import {createExactSearchLedger} from '../../../engine/planner-next/exactMainAndFeederCore';
import {createSetupPreparation} from '../../../engine/planner-next/setupPreparation';
import {setupFamilySequence,hasSetupReentry} from '../../../engine/planner-next/setupGrouping';
import {preflight,validatePlan} from '../../../engine/planner-next/validate';
const [source,destination]=process.argv.slice(2);
const adapter=adaptEngineInputToPlannerNextProblem(JSON.parse(readFileSync(source,'utf8')));
assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')throw Error('unsupported native problem');
const problem=structuredClone(adapter.problem),tasks=problem.tasks.sort((a,b)=>a.setupFamilyId!.localeCompare(b.setupFamilyId!)||a.id.localeCompare(b.id));
assert.equal(tasks.length,4);
const starts=[540,560,580,590];
for(const [index,task] of tasks.entries())task.availability=[{start:starts[index],end:starts[index]+task.duration}];
const witness=tasks.map((task,index)=>({...task,start:starts[index],end:starts[index]+task.duration}));
const preparation=createSetupPreparation(tasks[0].spaceId,tasks[2].setupFamilyId!,1,10,570);
const validation=validatePlan(problem,witness,[preparation]);
const exact=generateExactSetupBlockCandidates(problem,tasks,[],[],[],createExactSearchLedger(problem.budget.maxBranchExpansions));
const compatibility=generateBlockCandidates(problem,tasks,[],problem.budget.maxBranchExpansions);
const execution=executeAssistedPlanning(buildAssistedProblem(problem,createPlanningScope({kind:'DAY',value:'logical-gap'},{},tasks.map(t=>t.id)),[]));
const independentContinuity={...problem,spaces:problem.spaces.map(space=>({...space,secondaryContinuity:'OFF' as const}))};
const record={status:'BLOCKED',source,problem,witness,preparations:[preparation],sequence:setupFamilySequence(witness),reentry:hasSetupReentry(witness),validation,
  preflightWithIndependentContinuity:preflight(independentContinuity),exact:{outcome:exact.outcome,candidates:exact.candidates.length,evidence:exact.evidence},
  compatibility:{candidates:compatibility.candidates.length,exhausted:compatibility.exhausted,diagnostics:compatibility.diagnostics},execution,
  cause:{adapter:'engineInputAdapter.ts imposes secondaryContinuity REQUIRED for every setup policy',preflight:'validate.ts requires REQUIRED continuity for setup spaces',validation:'validatePlan validates one contiguous secondary block including preparations',
    exact:'generateExactSetupBlockCandidates uses uniform-duration compact slots per family',compatibility:'generateBlockCandidates starts each task at previous end (or preparation end)',
    consequence:'A physical wait inside one family is rejected despite no family reentry. Both existing setup generators have zero candidates; no budget exhaustion.'}};
writeFileSync(destination,JSON.stringify(record,null,2));
assert.equal(record.reentry,false);assert.equal(validation.setupViolationCount,0);assert.equal(validation.setupPreparationViolationCount,0);
assert.deepEqual(validation.reasonCodes,['SECONDARY_CONTINUITY_VIOLATION']);
assert.ok(record.preflightWithIndependentContinuity.includes('SETUP_REQUIRES_REQUIRED_CONTINUITY'));
assert.equal(exact.candidates.length,0);assert.equal(exact.outcome,'COMPLETE');
assert.equal(compatibility.candidates.length,0);assert.equal(compatibility.exhausted,false);
assert.equal(execution.evidence.completeForScope,false);
console.log(JSON.stringify({status:record.status,validation:validation.reasonCodes,exact:record.exact,compatibility:record.compatibility,execution:execution.evidence.reasonCodes}));
