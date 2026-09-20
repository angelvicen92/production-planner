import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { CapabilityStatus, EffectiveValueField, ReadinessSummary, SeverityBadge, SourceBadge, sourceLabels } from "./effective-configuration";

const value:any={capabilityId:"X",label:"Capacidad",category:"Avanzado",value:null,availability:"UNAVAILABLE",unit:"x",source:"UNKNOWN",validationStatus:"UNSUPPORTED",requiresReplan:"UNKNOWN",implementationStatus:"MISSING",blockers:["gap"],requiredForDay:false};
test("reusable configuration components expose Spanish text, not internal codes",()=>{
  assert.equal(sourceLabels.DAY_SNAPSHOT,"Heredado para este día");
  const html=renderToStaticMarkup(<><SourceBadge source="DAY_SNAPSHOT"/><SeverityBadge severity="REQUIRED"/><CapabilityStatus value={value}/><EffectiveValueField value={value}/><ReadinessSummary readiness={{status:"READY",issues:[]}}/></>);
  for(const text of ["Heredado para este día","Obligatorio","Aún no disponible","Esta capacidad aún no tiene un valor productivo","Revisa sólo las excepciones del día"])assert.match(html,new RegExp(text));
  assert.doesNotMatch(html,/UNSUPPORTED|DAY_OVERRIDE|PRODUCTIVE|PARTIAL|BLOCKED|daily_tasks|buildEngineInput/);
});
