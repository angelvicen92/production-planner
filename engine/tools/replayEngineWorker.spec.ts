import test from "node:test";
import assert from "node:assert/strict";
import { stableReplayOutputFingerprint } from "./replayEngineWorker";
test("fingerprint ignores runtime and generatedAt",()=>{ const a={output:{plannedTasks:[{taskId:1,startPlanned:"09:00"}],unplanned:[],feasible:true,complete:true}, runtimeMs:10, generatedAt:"a"}; const b={generatedAt:"b", runtimeMs:999, output:{complete:true,feasible:true,unplanned:[],plannedTasks:[{startPlanned:"09:00",taskId:1}]}}; assert.equal(stableReplayOutputFingerprint(a), stableReplayOutputFingerprint(b)); });
