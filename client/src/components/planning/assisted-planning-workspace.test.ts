import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {assistedValidationErrorMessage,transportViolationExplanation} from '../../lib/assisted-validation-messages';
const source=await readFile(new URL("./assisted-planning-workspace.tsx",import.meta.url),"utf8");
test('manual validation messages distinguish stale, uncertifiable, failure and a concrete transport conflict',()=>{
 const unsupported=assistedValidationErrorMessage({code:'ASSISTED_DELTA_VALIDATION_UNSUPPORTED',payload:{validationDiagnostics:{phase:'RULE_IDENTITY',reasonCodes:['ANCHORED_ACCOMPANIMENT_VIOLATION']}}})!;
 assert.match(unsupported,/acompañamientos y adyacencias/);assert.match(unsupported,/No se puede aceptar/);assert.doesNotMatch(unsupported,/obsoleta|ANCHORED/);
 assert.match(assistedValidationErrorMessage({code:'STALE_VALIDATION'})!,/obsoleta/);
 assert.match(assistedValidationErrorMessage({code:'ASSISTED_VALIDATION_FAILED'})!,/ha fallado/);
 assert.match(assistedValidationErrorMessage({code:'HARD_ADMIN_AUTHORIZATION_REQUIRED'})!,/autorización administrativa/);
 assert.match(assistedValidationErrorMessage({code:'ASSISTED_ACCEPT_FORBIDDEN'})!,/rol vigente/);
 assert.equal(assistedValidationErrorMessage({code:'STALE_DRAFT'}),null);
 assert.equal(transportViolationExplanation({ruleCode:'TRANSPORT_GROUPING_VIOLATION',details:{dimensions:{direction:'arrival',kind:'GROUP_SIZE',actualGroupSize:4,minimumGroupSize:1,maximumGroupSize:3}}}),'IN: grupo de 4 participantes; máximo permitido 3.');
});
test("scope requests use the pending selection and delegate prerequisite closure",()=>{assert.match(source,/taskIdsScopeSelector\(scopeTaskIds\)/);assert.match(source,/const selector=scopeSelector/);assert.match(source,/selector,includePrerequisites,\.\.\.guard\(\)/);assert.doesNotMatch(source,/dependsOnTaskIds|expandVisiblePrerequisites/);});
test("preview is consent based and apply sends only guards",()=>{assert.match(source,/preview\?\.outcome!=="PROPOSAL"/);assert.match(source,/Aplicar al borrador/);assert.match(source,/proposals\/\$\{runId\}\/apply`,guard\(\)/);assert.match(source,/Descartar propuesta/);assert.doesNotMatch(source,/daily-tasks/);});
test("assisted timeline edits only the draft while accept and rollback alone refresh product state",()=>{assert.match(source,/accept-stage`,\{\.\.\.guard\(\),confirmation\}\),true/);assert.match(source,/assisted\/rollback.*targetStageId/s);assert.match(source,/mode:viewAuthority==="accepted"\?"accepted":"assisted-draft"/);assert.match(source,/onApplyManualEdits:viewAuthority==="draft"&&authorized.current&&busy!=="autopilot"\?applyTimelineEdits/);assert.match(source,/assisted\/draft/);assert.doesNotMatch(source,/onGeneratePlan|onPinTask|daily-tasks/);});
test("bootstrap uses structured API authority and remains explicitly retryable",()=>{assert.match(source,/error\?\.status===404\|\|error\?\.code==="SESSION_NOT_FOUND"/);assert.doesNotMatch(source,/message.*includes\("404"\)/);assert.match(source,/bootstrapped\.current=false/);assert.match(source,/>Reintentar</);});
test("meal authority uses the accepted Stage or stored draft, independently from proposal preview",()=>{
  assert.match(source,/resolvePlanningOperationalMeals\(plan.plannerNextConfiguration,viewAuthority==="accepted"\?active\?\.snapshotJson:draft,viewAuthority\)/);
  assert.match(source,/draft=state\?\.draft\?\?state\?\.session\?\.draftSnapshotJson/);
  assert.match(source,/timelineProps=\{\{\.\.\.timelineProps as any,operationalMeals,/);
  const preview=source.slice(source.indexOf("const displayDraft="),source.indexOf("const assistedPlan="));
  assert.doesNotMatch(preview,/operationalMeals/);
});
test("every authoritative 409 clears stale preview and run before refresh",()=>{assert.match(source,/isAssistedConflict=\(error:any\)=>error\?\.status===409/);assert.match(source,/if\(isAssistedConflict\(e\)\)\{clearProposal\(\);await refresh\(\);\}/);});
test("manual and location scopes share live eligibility and the accepted base",()=>{assert.match(source,/pendingScopeTasks\(plan.dailyTasks\?\?\[\],base\)/);assert.match(source,/eligibleTasks.map/);assert.match(source,/tasks=\{eligibleTasks\}/);assert.match(source,/assisted-scope-count/);});
test("the complete Assisted operator surface renders human context rather than internal identifiers or codes",()=>{
  const surface=source.slice(source.indexOf("const toolbar="),source.indexOf("<PlanningWorkspaceLayout"));
  assert.match(surface,/violationExplanation\(violation\)/);assert.match(surface,/taskContext/);assert.match(surface,/warningExplanation\(warning\)/);
  assert.doesNotMatch(surface,/engineReasonCode|reasonCodes|\.ruleCode|\{[\w.]+\.kind\}|taskIds\.join|config \{|run \{|errorCode/);
  assert.match(source,/hardAffectedTaskIds/);
  assert.doesNotMatch(source,/setMessage\(errorCode|setMessage\(run\.message/);
});
test("Assisted receives product plan while V4 remains outside its authority",async()=>{const page=await readFile(new URL("../../pages/plan-details.tsx",import.meta.url),"utf8");const call=page.slice(page.indexOf("<AssistedPlanningWorkspace"),page.indexOf("/> : null : <>",page.indexOf("<AssistedPlanningWorkspace")));assert.match(call,/plan=\{assistedDayPlan as any\}/);assert.match(page,/const assistedDayPlan = useMemo\(\(\) => plan \? \(\{ \.\.\.plan, arrivalTaskTemplateName:/);assert.doesNotMatch(call,/planningViewPlan/);});

test("restart requires operator consent and delegates a guarded bootstrap move before clearing local state",()=>{
  assert.match(source,/await requestConsent\(\{title:"Reiniciar Asistida"/);
  assert.match(source,/assisted\/restart`,\{\.\.\.guard\(\),confirmation:"RESTART_BOOTSTRAP"\}/);
  assert.match(source,/setSelected\(\[\]\);setSelectedSpaces\(\[\]\)/);
  assert.match(source,/>Reiniciar Asistida</);
});
