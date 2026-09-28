import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistedPlanningSnapshotV1, fingerprintAssistedPlanningSnapshotV1 } from "./assistedPlanningSnapshot";

const base = [
  { id: 2, startPlanned: null, endPlanned: null, zoneId: null, spaceId: null, status: "pending", startReal: null },
  { id: 1, startPlanned: "09:00", endPlanned: "09:30", zoneId: 3, spaceId: 4, locationLabel: "A", durationOverride: 30, camerasOverride: 2, status: "done", startReal: "09:02" },
] as const;

test("complete planning snapshots are canonical, placement-sensitive and include unplaced tasks", () => {
  const first = buildAssistedPlanningSnapshotV1(base);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first), "69008e0fca5764a24ecd176eea4a8770d69a0391b64ed834a8f36564e85065cb");
  assert.equal(Object.prototype.hasOwnProperty.call(first,"planningBlocks"),false);
  const reordered = buildAssistedPlanningSnapshotV1([...base].reverse());
  assert.deepEqual(first.tasks.map((task) => task.taskId), [1, 2]);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first), fingerprintAssistedPlanningSnapshotV1(reordered));
  const moved = buildAssistedPlanningSnapshotV1(base.map((task) => task.id === 1 ? { ...task, startPlanned: "09:01" } : task));
  assert.notEqual(fingerprintAssistedPlanningSnapshotV1(first), fingerprintAssistedPlanningSnapshotV1(moved));
  assert.equal(first.tasks[1].startPlanned, null);
});

test("optional itinerant assignment is fingerprinted while legacy rows retain their exact identity",()=>{
  const legacy=buildAssistedPlanningSnapshotV1(base),legacyFingerprint=fingerprintAssistedPlanningSnapshotV1(legacy);
  assert.equal(legacyFingerprint,"69008e0fca5764a24ecd176eea4a8770d69a0391b64ed834a8f36564e85065cb");
  assert.equal(Object.prototype.hasOwnProperty.call(legacy.tasks[0],"itinerantTeamId"),false);
  const selected=buildAssistedPlanningSnapshotV1(base.map(row=>row.id===1?{...row,itinerantTeamId:8}:row));
  assert.equal(selected.tasks[0]!.itinerantTeamId,8);
  assert.notEqual(fingerprintAssistedPlanningSnapshotV1(selected),legacyFingerprint);
  const replay=buildAssistedPlanningSnapshotV1(selected.tasks.map(row=>({id:row.taskId,...row})));
  assert.deepEqual(replay,selected);assert.equal(fingerprintAssistedPlanningSnapshotV1(replay),fingerprintAssistedPlanningSnapshotV1(selected));
});

test("explicit physical assignments are canonical while absent legacy assignments remain omitted",()=>{
  const legacy=buildAssistedPlanningSnapshotV1(base);
  const assigned=buildAssistedPlanningSnapshotV1(base.map(row=>row.id===1?{...row,assignedResources:[81,80,81]}:{...row,assignedResources:null}));
  assert.deepEqual(assigned.tasks[0]!.assignedResourceIds,[80,81]);
  assert.deepEqual(assigned.tasks[1]!.assignedResourceIds,[]);
  assert.notEqual(fingerprintAssistedPlanningSnapshotV1(assigned),fingerprintAssistedPlanningSnapshotV1(legacy));
  assert.deepEqual(buildAssistedPlanningSnapshotV1(assigned.tasks.map(row=>({id:row.taskId,...row}))),assigned);
});

test("planning block fingerprints canonicalize block order while preserving member order",()=>{
  const tasks=buildAssistedPlanningSnapshotV1(base).tasks;
  const blocks=[{blockId:"block:a",memberTaskIds:[1,2],scopeProvenance:{kind:"TASK_IDS"},spaceId:4,activityTemplateId:8,order:0}] as const;
  const first=buildAssistedPlanningSnapshotV1(tasks.map(task=>({id:task.taskId,...task})),blocks);
  const replay=buildAssistedPlanningSnapshotV1([...tasks].reverse().map(task=>({id:task.taskId,...task})),blocks);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first),fingerprintAssistedPlanningSnapshotV1(replay));
  const reorderedMetadata=buildAssistedPlanningSnapshotV1(tasks.map(task=>({id:task.taskId,...task})),[{...blocks[0],scopeProvenance:{z:1,a:{y:2,x:3}}}]);
  const canonicalMetadata=buildAssistedPlanningSnapshotV1(tasks.map(task=>({id:task.taskId,...task})),[{...blocks[0],scopeProvenance:{a:{x:3,y:2},z:1}}]);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(reorderedMetadata),fingerprintAssistedPlanningSnapshotV1(canonicalMetadata));
  const reversed=buildAssistedPlanningSnapshotV1(tasks.map(task=>({id:task.taskId,...task})),[{...blocks[0],memberTaskIds:[2,1]}]);
  assert.notEqual(fingerprintAssistedPlanningSnapshotV1(first),fingerprintAssistedPlanningSnapshotV1(reversed));
});

test("execution changes are excluded and source input remains mutable/unmodified", () => {
  const rows: Array<Record<string, unknown> & { id: number; startReal: string | null; status: string }> = base.map((row) => ({ ...row }));
  const before = structuredClone(rows);
  const first = buildAssistedPlanningSnapshotV1(rows);
  rows[0].startReal = "12:00";
  rows[0].status = "in_progress";
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first), fingerprintAssistedPlanningSnapshotV1(buildAssistedPlanningSnapshotV1(rows)));
  assert.deepEqual(before.map(({ startReal: _, status: __, ...row }) => row), rows.map(({ startReal: _, status: __, ...row }) => row));
  assert.equal(Object.isFrozen(first), true);
});

test("empty and omitted PlanningBlocks preserve the legacy blockless identity",()=>{const omitted=buildAssistedPlanningSnapshotV1(base);const empty=buildAssistedPlanningSnapshotV1(base,[]);assert.deepEqual(empty,omitted);assert.equal(Object.prototype.hasOwnProperty.call(empty,"planningBlocks"),false);assert.equal(fingerprintAssistedPlanningSnapshotV1(empty),fingerprintAssistedPlanningSnapshotV1(omitted));});

test("operational meals are canonical, deterministic, and legacy identity remains unchanged",()=>{
  const legacy=buildAssistedPlanningSnapshotV1(base);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(legacy),"69008e0fca5764a24ecd176eea4a8770d69a0391b64ed834a8f36564e85065cb");
  const meals=[
    {policyId:"meal:b",startPlanned:"13:30",endPlanned:"14:00"},
    {policyId:"meal:a",startPlanned:"13:00",endPlanned:"13:30"},
  ];
  const first=buildAssistedPlanningSnapshotV1(base,undefined,meals);
  const reordered=buildAssistedPlanningSnapshotV1(base,undefined,[...meals].reverse());
  assert.deepEqual(first.operationalMeals?.map(meal=>meal.policyId),["meal:a","meal:b"]);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first),fingerprintAssistedPlanningSnapshotV1(reordered));
  assert.notEqual(fingerprintAssistedPlanningSnapshotV1(first),fingerprintAssistedPlanningSnapshotV1(legacy));
  assert.throws(()=>buildAssistedPlanningSnapshotV1(base,undefined,[meals[0],meals[0]]),/duplicate operational meal/);
});

test("setup preparations are canonical while absent and empty values preserve the legacy fingerprint",()=>{
  const legacy=buildAssistedPlanningSnapshotV1(base);
  const empty=buildAssistedPlanningSnapshotV1(base,undefined,undefined,[]);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(empty),fingerprintAssistedPlanningSnapshotV1(legacy));
  assert.equal(Object.prototype.hasOwnProperty.call(empty,"setupPreparations"),false);
  const preparations=[
    {id:"setup-preparation:space:4:family:b:1",spaceId:4,setupFamilyId:"4:b",entryIndex:1,duration:10,start:80,end:90},
    {id:"setup-preparation:space:4:family:a:1",spaceId:4,setupFamilyId:"4:a",entryIndex:1,duration:10,start:60,end:70},
  ];
  const first=buildAssistedPlanningSnapshotV1(base,undefined,undefined,preparations);
  const reordered=buildAssistedPlanningSnapshotV1(base,undefined,undefined,[...preparations].reverse());
  assert.deepEqual(first.setupPreparations?.map(item=>item.start),[60,80]);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first),fingerprintAssistedPlanningSnapshotV1(reordered));
  assert.throws(()=>buildAssistedPlanningSnapshotV1(base,undefined,undefined,[preparations[0],preparations[0]]),/duplicate setup preparation/);
  assert.throws(()=>buildAssistedPlanningSnapshotV1(base,undefined,undefined,[{...preparations[0],end:95}]),/invalid.*setup preparation/);
});

test("round preparations are canonical, fingerprinted, replayable, and legacy-compatible",()=>{
  const legacy=buildAssistedPlanningSnapshotV1(base);
  const preparations=[
    {id:"round-preparation:sync:8:3",synchronizationId:"sync",spaceId:8,roundIndex:3,duration:5,start:100,end:105},
    {id:"round-preparation:sync:7:2",synchronizationId:"sync",spaceId:7,roundIndex:2,duration:5,start:80,end:85},
  ];
  const first=buildAssistedPlanningSnapshotV1(base,undefined,undefined,undefined,preparations);
  const reordered=buildAssistedPlanningSnapshotV1(base,undefined,undefined,undefined,[...preparations].reverse());
  assert.deepEqual(first.roundPreparations?.map(item=>item.start),[80,100]);
  assert.equal(fingerprintAssistedPlanningSnapshotV1(first),fingerprintAssistedPlanningSnapshotV1(reordered));
  assert.notEqual(fingerprintAssistedPlanningSnapshotV1(first),fingerprintAssistedPlanningSnapshotV1(legacy));
  assert.deepEqual(buildAssistedPlanningSnapshotV1(first.tasks.map(task=>({id:task.taskId,...task})),undefined,undefined,undefined,first.roundPreparations),first);
  assert.equal(Object.prototype.hasOwnProperty.call(buildAssistedPlanningSnapshotV1(base,undefined,undefined,undefined,[]),"roundPreparations"),false);
  assert.throws(()=>buildAssistedPlanningSnapshotV1(base,undefined,undefined,undefined,[preparations[0],preparations[0]]),/duplicate round preparation/);
  assert.throws(()=>buildAssistedPlanningSnapshotV1(base,undefined,undefined,undefined,[{...preparations[0],end:106}]),/invalid.*round preparation/);
});
