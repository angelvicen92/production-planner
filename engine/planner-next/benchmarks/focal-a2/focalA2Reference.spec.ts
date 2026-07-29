import assert from "node:assert/strict";import test from "node:test";
import { planMainFlowAndFeeders } from "../../planMainFlowAndFeeders";import { focalA2Problem } from "./focalA2Problem";import { focalA2Reference,focalA2Tasks } from "./focalA2Reference";import { validateFocalA2Reference } from "./validateFocalA2Reference";
test("FOCAL-A2 canonical corpus and independent human validation",()=>{const v=validateFocalA2Reference();assert.equal(focalA2Reference.participants.length,19);assert.equal(focalA2Tasks.length,38);assert.equal(new Set(focalA2Tasks.map(t=>t.id)).size,38);assert.equal(focalA2Tasks.filter(t=>t.kind==="vocal").length,19);assert.equal(focalA2Tasks.filter(t=>t.kind==="main").length,19);for(const t of focalA2Tasks.filter(t=>t.kind==="main"))assert.deepEqual(t.dependencies,[t.id.replace("main-","vocal-")]);assert.equal(v.hardValid,true);assert.equal(v.hardViolationCount,0);assert.equal(v.mainFlowMorningTaskCount,11);assert.equal(v.mainFlowAfternoonTaskCount,8);assert.equal(v.mainFlowGapMinutes,0);assert.deepEqual(v.mainFlowBlockSequence,["coach-lucia","coach-jose-maria","coach-lucia","coach-jose-maria"]);assert.equal(v.totalParticipantPresenceMinutes,2345);assert.equal(v.maxParticipantPresenceMinutes,230);assert.equal(v.focalMakespanMinutes,450);assert.equal(v.globalProtectedMealConflicts.length,5)});
test("projection is fresh, immutable under planning, and order-independent reference validation",()=>{const p=focalA2Problem(),snap=structuredClone(p);planMainFlowAndFeeders(p);assert.deepEqual(p,snap);const reversed=structuredClone(focalA2Reference);reversed.tasks.reverse();reversed.participants.reverse();assert.deepEqual(validateFocalA2Reference(reversed),validateFocalA2Reference());});
test("focal validator reports deterministic negative violations without throwing",()=>{const cases:Array<[string,(r:any)=>void,string]>=[
 ["duplicate id",r=>{r.tasks[1].id=r.tasks[0].id},"DUPLICATE_ID:"],
 ["duplicate participant",r=>r.participants.push({...r.participants[0]}),"DUPLICATE_PARTICIPANT:"],
 ["missing vocal",r=>r.tasks.splice(r.tasks.findIndex((t:any)=>t.kind==="vocal"),1),"VOCAL_COUNT:"],
 ["missing main",r=>r.tasks.splice(r.tasks.findIndex((t:any)=>t.kind==="main"),1),"MAIN_COUNT:"],
 ["two vocals",r=>r.tasks.push({...r.tasks.find((t:any)=>t.kind==="vocal"),id:"extra-vocal"}),"VOCAL_COUNT:"],
 ["two mains",r=>r.tasks.push({...r.tasks.find((t:any)=>t.kind==="main"),id:"extra-main"}),"MAIN_COUNT:"],
 ["unknown dependency",r=>{r.tasks.find((t:any)=>t.kind==="main").dependencies=["unknown"]},"UNKNOWN_DEPENDENCY:"],
 ["foreign dependency",r=>{const ms=r.tasks.filter((t:any)=>t.kind==="main"),vs=r.tasks.filter((t:any)=>t.kind==="vocal");ms[0].dependencies=[vs[1].id]},"DEPENDENCY_PARTICIPANT:"],
 ["removed dependency",r=>{r.tasks.find((t:any)=>t.kind==="main").dependencies=[]},"DEPENDENCY:"],
 ["duration",r=>{r.tasks[0].duration=10},"DURATION:"],
 ["end duration",r=>{r.tasks[0].end++},"END_DURATION:"],
 ["presence",r=>{r.participants.find((p:any)=>p.participantId===r.tasks[0].participantId).presenceStart=r.tasks[0].start+1},"PRESENCE:"],
 ["coach availability",r=>{r.tasks[0].start=400;r.tasks[0].end=415},"COACH_AVAILABILITY:"],
 ["space availability",r=>{r.tasks[0].start=400;r.tasks[0].end=415},"SPACE_AVAILABILITY:"],
 ["participant overlap",r=>{const own=r.tasks.filter((t:any)=>t.participantId===r.tasks[0].participantId);own[1].start=own[0].start;own[1].end=own[0].end},"PARTICIPANT_OVERLAP:"],
 ["coach overlap",r=>{const xs=r.tasks.filter((t:any)=>t.coachId===r.tasks[0].coachId);xs[1].start=xs[0].start;xs[1].end=xs[0].end},"COACH_OVERLAP:"],
 ["space overlap",r=>{const xs=r.tasks.filter((t:any)=>t.spaceId===r.tasks[0].spaceId);xs[1].start=xs[0].start;xs[1].end=xs[0].end},"SPACE_OVERLAP:"],
 ["main meal",r=>{const t=r.tasks.find((x:any)=>x.kind==="main");t.start=r.meal.start;t.end=t.start+t.duration},"MAIN_DURING_MEAL"],
 ["morning gap",r=>{const xs=r.tasks.filter((x:any)=>x.kind==="main"&&x.end<=r.meal.start).sort((a:any,b:any)=>a.start-b.start);xs[1].start+=5;xs[1].end+=5},"MORNING_GAP"],
 ["afternoon gap",r=>{const xs=r.tasks.filter((x:any)=>x.kind==="main"&&x.start>=r.meal.end).sort((a:any,b:any)=>a.start-b.start);xs[1].start+=5;xs[1].end+=5},"AFTERNOON_GAP"],
 ["morning boundary",r=>{r.meal.start+=5},"MORNING_MEAL_BOUNDARY"],
 ["afternoon boundary",r=>{r.meal.end-=5},"AFTERNOON_MEAL_BOUNDARY"],
 ["block cut",r=>{const a=r.tasks.filter((x:any)=>x.kind==="main"&&x.end<=r.meal.start).sort((x:any,y:any)=>x.start-y.start).at(-1),b=r.tasks.filter((x:any)=>x.kind==="main"&&x.start>=r.meal.end).sort((x:any,y:any)=>x.start-y.start)[0];b.blockKey=a.blockKey},"MEAL_CUT_WITHIN_BLOCK"]];
 for(const [name,mutate,code] of cases){const value=structuredClone(focalA2Reference),before=structuredClone(value);mutate(value);assert.doesNotThrow(()=>validateFocalA2Reference(value),name);const result=validateFocalA2Reference(value);assert.equal(result.hardValid,false,name);assert.ok(result.violations.some((v:string)=>v.startsWith(code)),`${name}: ${result.violations}`);assert.deepEqual(value,value);assert.notDeepEqual(value,before)}
 const incomplete:any=structuredClone(focalA2Reference);delete incomplete.tasks[0].coachId;delete incomplete.tasks[1].spaceId;delete incomplete.tasks.find((t:any)=>t.kind==="main").dependencies;assert.doesNotThrow(()=>validateFocalA2Reference(incomplete));assert.equal(validateFocalA2Reference(incomplete).hardValid,false);
});
