import assert from "node:assert/strict";
import test from "node:test";
import { taskRespectsScheduledDependencies } from "./placement";
import type { ScheduledTask, Task } from "./contracts";

const task:Task={id:"work",kind:"auxiliary",participantId:"person",spaceId:"space",duration:10,dependencies:["before"]};
const placed=(id:string,start:number,dependencies:string[]=[]):ScheduledTask=>({...task,id,start,end:start+10,dependencies});

test("dependency placement checks both temporal directions independently of search order",()=>{
  const context=[placed("before",10),placed("after",35,[task.id]),placed("unrelated",0)];
  const before=structuredClone(context);
  for(const order of [context,[...context].reverse(),[context[2]!,context[0]!,context[1]!]]){
    assert.equal(taskRespectsScheduledDependencies(task,15,order),false);
    assert.equal(taskRespectsScheduledDependencies(task,20,order),true);
    assert.equal(taskRespectsScheduledDependencies(task,25,order),true);
    assert.equal(taskRespectsScheduledDependencies(task,30,order),false);
  }
  assert.deepEqual(context,before);
});

test("duplicate predecessor identities retain the last occurrence while every dependent remains authoritative",()=>{
  assert.equal(taskRespectsScheduledDependencies(task,20,[placed("before",30),placed("before",10)]),true);
  assert.equal(taskRespectsScheduledDependencies(task,20,[placed("before",10),placed("before",30)]),false);
  const noPredecessors={...task,dependencies:[]};
  assert.equal(taskRespectsScheduledDependencies(noPredecessors,20,[placed("after",25,[task.id]),placed("after",40,[task.id])]),false);
  assert.equal(taskRespectsScheduledDependencies({...task,dependencies:["missing"]},20,[]),true);
});

test("allocation-free dependency checks equal the prior authority across sparse and dense contexts",()=>{
  const original=(candidate:Task,start:number,context:ScheduledTask[])=>{
    const byId=new Map(context.map(item=>[item.id,item]));
    return candidate.dependencies.every(id=>!byId.has(id)||byId.get(id)!.end<=start)
      &&context.every(dependent=>!dependent.dependencies.includes(candidate.id)||start+candidate.duration<=dependent.start);
  };
  for(const size of [0,1,19,247]){
    const context=Array.from({length:size},(_,index)=>placed(`placed-${index%17}`,index*5,index%13===0?[task.id]:[]));
    for(const dependencies of [[],["placed-1"],["placed-1","placed-4","missing"]]){
      const candidate={...task,dependencies};
      for(let start=0;start<=1500;start+=5)assert.equal(taskRespectsScheduledDependencies(candidate,start,context),original(candidate,start,context));
    }
  }
});
