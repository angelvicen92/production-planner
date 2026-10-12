import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=await readFile(new URL("./assisted-planning-workspace.tsx",import.meta.url),"utf8");
test("scope requests use the pending selection and delegate prerequisite closure",()=>{assert.match(source,/taskIdsScopeSelector\(scopeTaskIds\)/);assert.match(source,/const selector=scopeSelector/);assert.match(source,/selector,includePrerequisites,\.\.\.guard\(\)/);assert.doesNotMatch(source,/dependsOnTaskIds|expandVisiblePrerequisites/);});
test("preview is consent based and apply sends only guards",()=>{assert.match(source,/preview\?\.outcome!=="PROPOSAL"/);assert.match(source,/Aplicar al borrador/);assert.match(source,/proposals\/\$\{runId\}\/apply`,guard\(\)/);assert.match(source,/Descartar propuesta/);assert.doesNotMatch(source,/daily-tasks/);});
test("assisted timeline edits only the draft while accept and rollback alone refresh product state",()=>{assert.match(source,/accept-stage`,\{\.\.\.guard\(\),confirmation\}\),true/);assert.match(source,/assisted\/rollback.*targetStageId/s);assert.match(source,/mode="assisted-draft"/);assert.match(source,/onApplyManualEdits=\{applyTimelineEdits\}/);assert.match(source,/assisted\/draft/);assert.doesNotMatch(source,/onGeneratePlan|onPinTask|daily-tasks/);});
test("bootstrap uses structured API authority and remains explicitly retryable",()=>{assert.match(source,/error\?\.status===404\|\|error\?\.code==="SESSION_NOT_FOUND"/);assert.doesNotMatch(source,/message.*includes\("404"\)/);assert.match(source,/bootstrapped\.current=false/);assert.match(source,/>Reintentar</);});
test("every authoritative 409 clears stale preview and run before refresh",()=>{assert.match(source,/isAssistedConflict=\(error:any\)=>error\?\.status===409/);assert.match(source,/if\(isAssistedConflict\(e\)\)\{clearProposal\(\);await refresh\(\);\}/);});
test("manual and location scopes share live eligibility and the accepted base",()=>{assert.match(source,/pendingScopeTasks\(plan.dailyTasks\?\?\[\],base\)/);assert.match(source,/eligibleTasks.map/);assert.match(source,/tasks=\{eligibleTasks\}/);assert.match(source,/assisted-scope-count/);});
test("the complete Assisted operator surface renders human context rather than internal identifiers or codes",()=>{
  const surface=source.slice(source.indexOf("const toolbar="),source.indexOf("<FullscreenPlanningPanel"));
  assert.match(surface,/violationExplanation\(violation\)/);assert.match(surface,/taskContext/);assert.match(surface,/warningExplanation\(warning\)/);
  assert.doesNotMatch(surface,/engineReasonCode|reasonCodes|\.ruleCode|\{[\w.]+\.kind\}|taskIds\.join|config \{|run \{|errorCode/);
  assert.match(source,/hardAffectedTaskIds/);
  assert.doesNotMatch(source,/setMessage\(errorCode|setMessage\(run\.message/);
});
test("Assisted receives product plan while V4 remains outside its authority",async()=>{const page=await readFile(new URL("../../pages/plan-details.tsx",import.meta.url),"utf8");const call=page.slice(page.indexOf("<AssistedPlanningWorkspace"),page.indexOf("/> : <>",page.indexOf("<AssistedPlanningWorkspace")));assert.match(call,/plan=\{plan as any\}/);assert.doesNotMatch(call,/planningViewPlan/);});

test("restart requires operator consent and delegates a guarded bootstrap move before clearing local state",()=>{
  assert.match(source,/window.confirm\("Volverás al estado inicial/);
  assert.match(source,/assisted\/restart`,\{\.\.\.guard\(\),confirmation:"RESTART_BOOTSTRAP"\}/);
  assert.match(source,/setSelected\(\[\]\);setSelectedSpaces\(\[\]\)/);
  assert.match(source,/>Reiniciar Asistida</);
});
