import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source=await readFile(new URL("./assisted-planning-workspace.tsx",import.meta.url),"utf8");
test("scope requests preserve TASK_IDS/SPACE and delegate prerequisite closure",()=>{assert.match(source,/kind:"TASK_IDS",taskIds:selected/);assert.match(source,/kind:"SPACE",spaceId:Number\(spaceId\)/);assert.match(source,/selector,includePrerequisites,\.\.\.guard\(\)/);assert.doesNotMatch(source,/dependsOnTaskIds|expandVisiblePrerequisites/);});
test("preview is consent based and apply sends only guards",()=>{assert.match(source,/preview\?\.outcome!=="PROPOSAL"/);assert.match(source,/Aplicar al borrador/);assert.match(source,/proposals\/\$\{runId\}\/apply`,guard\(\)/);assert.match(source,/Descartar propuesta/);assert.doesNotMatch(source,/daily-tasks/);});
test("accept and rollback refresh accepted product state while assisted timeline is read-only",()=>{assert.match(source,/accept-stage`,guard\(\)\),true/);assert.match(source,/assisted\/rollback.*targetStageId/s);assert.match(source,/mode="assisted-draft"/);assert.doesNotMatch(source,/onApplyManualEdits|onGeneratePlan|onPinTask/);});
