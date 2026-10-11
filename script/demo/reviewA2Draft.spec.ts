import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reviewA2Draft } from './reviewA2Draft';
import type { PlannerNextProblem } from '../../engine/planner-next/contracts';
const availability=[{start:0,end:100}];
const source:PlannerNextProblem={day:availability[0]!,spaces:[{id:'main',availability}],participants:[{id:'person',availability}],coaches:[{id:'coach',availability}],resources:[],
 tasks:[{id:'task:1',kind:'main',participantId:'person',coachId:'coach',duration:15,spaceId:'main',dependencies:[],blockKey:'coach'}],
 mainFlow:{spaceId:'main',preferredEnd:100,continuity:'REQUIRED',maxBlocksByKey:1,minTasksPerBlock:1},participantTransitionMinutes:0,resourceTransitionMinutes:0,
 budget:{bestK:1,maxPatterns:1,maxBacktracks:0,maxBranchExpansions:100_000}};
const body={kind:'JOINT_COMPLETION' as const,version:1 as const,tasks:[{...source.tasks[0]!,start:20,end:35}],preparations:[],roundPreparations:[],participantMeals:[],operationalMeals:[],spaceMeals:[]};
const witness={...body,fingerprint:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
test('local review validates a new placement without changing the recorded plan',()=>{const before=structuredClone(witness);assert.equal(reviewA2Draft(source,witness,[{taskId:1,start:'00:25',end:'00:40'}]).feasible,true);assert.deepEqual(witness,before);});
test('local review reports canonical conflicts',()=>{assert.equal(reviewA2Draft(source,witness,[{taskId:1,start:'01:40',end:'01:55'}]).feasible,false);});
test('local review rejects invalid duration, identities and duplicate edits',()=>{assert.throws(()=>reviewA2Draft(source,witness,[{taskId:1,start:'00:25',end:'00:45'}]));assert.throws(()=>reviewA2Draft(source,witness,[{taskId:99,start:'00:25',end:'00:40'}]));assert.throws(()=>reviewA2Draft(source,witness,[{taskId:1,start:'00:25',end:'00:40'},{taskId:1,start:'00:25',end:'00:40'}]));});
