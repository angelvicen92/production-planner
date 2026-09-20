import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { summarizeConfigRefreshChange } from "./config-refresh-summary";

test("task and optimizer refresh changes have deterministic operational summaries",()=>{
  assert.deepEqual(summarizeConfigRefreshChange({key:"task_templates:1",authority:"task_templates",kind:"MODIFIED",label:"Cocina",localOverride:false,currentValue:{defaultDuration:30,defaultSpaceId:1,dependencyTemplateIds:[]},candidateValue:{defaultDuration:45,defaultSpaceId:2,dependencyTemplateIds:[3]}}),["Duración: 30 → 45 min","Cambia el espacio habitual.","Cambian sus dependencias."]);
  assert.deepEqual(summarizeConfigRefreshChange({key:"optimizer:settings",authority:"optimizer",kind:"MODIFIED",label:"Preferencias",localOverride:false,currentValue:{editingMode:"BASIC",groupingZoneIds:[1]},candidateValue:{editingMode:"ADVANCED",groupingZoneIds:[1,2]}}),["Modo de configuración: avanzado.","Cambian las zonas que se agrupan."]);
});

test("refresh UI never renders raw JSON values",()=>{
  const source=readFileSync(new URL("../components/planning/assisted-planning-workspace.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(source,/JSON\.stringify\((?:change\.)?(?:currentValue|candidateValue)/);
  assert.match(source,/summarizeConfigRefreshChange/);
});
