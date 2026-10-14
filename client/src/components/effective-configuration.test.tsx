import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { CapabilityStatus, EffectiveValueField, ReadinessSummary, SeverityBadge, SourceBadge, sourceLabels } from "./day-workspace/effective-configuration-fields";

const value:any={capabilityId:"X",label:"Capacidad",category:"Avanzado",value:null,availability:"UNAVAILABLE",unit:"x",source:"UNKNOWN",validationStatus:"UNSUPPORTED",requiresReplan:"UNKNOWN",implementationStatus:"MISSING",blockers:["gap"],requiredForDay:false};
test("reusable configuration components expose Spanish text, not internal codes",()=>{
  assert.equal(sourceLabels.DAY_SNAPSHOT,"Valor materializado del día");
  assert.equal(sourceLabels.UNKNOWN,"Origen desconocido");
  const html=renderToStaticMarkup(<><SourceBadge source="INHERITED"/><SourceBadge source="DAY_OVERRIDE"/><SourceBadge source="LEGACY_BACKFILL"/><SourceBadge source="UNKNOWN"/><SeverityBadge severity="REQUIRED"/><CapabilityStatus value={value}/><EffectiveValueField value={value}/><ReadinessSummary readiness={{status:"READY",issues:[]}}/></>);
  for(const text of ["Heredado","Modificado para este día","Migrado de configuración anterior","Origen desconocido","Obligatorio","Aún no disponible","Esta capacidad aún no tiene un valor productivo","Revisa sólo las excepciones del día"])assert.match(html,new RegExp(text));
  assert.doesNotMatch(html,/UNSUPPORTED|DAY_OVERRIDE|PRODUCTIVE|PARTIAL|BLOCKED|daily_tasks|buildEngineInput/);
});

test("workday and meal provenance use human formatters rather than raw JSON",()=>{
  const source=readFileSync(new URL("./effective-configuration.tsx",import.meta.url),"utf8")+readFileSync(new URL("./day-workspace/effective-configuration-fields.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(source,/JSON\.stringify\(value\.(?:baseline|defaultGeneral)\)/);
  for(const text of ["Heredado del día", "Configuración habitual actual", "Ventana flexible", "Parada global"]) assert.match(source,new RegExp(text));
});

test("day configuration loads through authenticated apiRequest rather than raw fetch",()=>{
  const source=readFileSync(new URL("./effective-configuration.tsx",import.meta.url),"utf8")+readFileSync(new URL("./day-workspace/effective-configuration-fields.tsx",import.meta.url),"utf8");
  assert.match(source,/apiRequest<EffectiveConfigurationView>\("GET",`\/api\/plans\/\$\{planId\}\/effective-configuration`\)/);
  assert.doesNotMatch(source,/fetch\(`\/api\/plans\/\$\{planId\}\/effective-configuration`/);
});


test("missing day/optimizer baselines do not crash the effective configuration tab",()=>{
  const available={...value,availability:"AVAILABLE",implementationStatus:"PRODUCTIVE",validationStatus:"VALID",source:"DAY_OVERRIDE",blockers:[]};
  const cases=[
    {capabilityId:"OPTIMIZATION",value:{editingMode:"ADVANCED"},baseline:undefined,defaultGeneral:undefined},
    {capabilityId:"OPTIMIZATION",value:{editingMode:"BASIC"},baseline:null,defaultGeneral:null},
    {capabilityId:"WORKDAY_WINDOW",value:{start:"09:00",end:"21:00"},baseline:undefined,defaultGeneral:null},
    {capabilityId:"GLOBAL_MEAL_BREAK",value:{mode:"flexible_meal_window",window:{start:"13:00",end:"16:30"}},baseline:undefined,defaultGeneral:undefined},
  ];
  for(const input of cases){
    const html=renderToStaticMarkup(<EffectiveValueField value={{...available,...input}}/>);
    assert.match(html,/Capacidad/);
    assert.doesNotMatch(html,/undefined|Heredado del día|Configuración habitual actual/);
  }
});
