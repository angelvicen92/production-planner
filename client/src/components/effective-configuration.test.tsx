import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { CapabilityStatus, EffectiveValueField, ReadinessSummary, SeverityBadge, SourceBadge, sourceLabels } from "./effective-configuration";

const value:any={capabilityId:"X",label:"Capacidad",category:"Avanzado",value:null,availability:"UNAVAILABLE",unit:"x",source:"UNKNOWN",validationStatus:"UNSUPPORTED",requiresReplan:"UNKNOWN",implementationStatus:"MISSING",blockers:["gap"],requiredForDay:false};
test("reusable configuration components expose Spanish text, not internal codes",()=>{
  assert.equal(sourceLabels.DAY_SNAPSHOT,"Valor materializado del día");
  assert.equal(sourceLabels.UNKNOWN,"Origen desconocido");
  const html=renderToStaticMarkup(<><SourceBadge source="INHERITED"/><SourceBadge source="DAY_OVERRIDE"/><SourceBadge source="LEGACY_BACKFILL"/><SourceBadge source="UNKNOWN"/><SeverityBadge severity="REQUIRED"/><CapabilityStatus value={value}/><EffectiveValueField value={value}/><ReadinessSummary readiness={{status:"READY",issues:[]}}/></>);
  for(const text of ["Heredado","Modificado para este día","Migrado de configuración anterior","Origen desconocido","Obligatorio","Aún no disponible","Esta capacidad aún no tiene un valor productivo","Revisa sólo las excepciones del día"])assert.match(html,new RegExp(text));
  assert.doesNotMatch(html,/UNSUPPORTED|DAY_OVERRIDE|PRODUCTIVE|PARTIAL|BLOCKED|daily_tasks|buildEngineInput/);
});
