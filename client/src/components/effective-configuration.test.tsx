import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { CapabilityStatus, EffectiveValueField, ReadinessSummary, SeverityBadge, SourceBadge, sourceLabels } from "./effective-configuration";

const value:any={capabilityId:"X",label:"Capacidad",category:"Avanzado",value:null,availability:"UNAVAILABLE",unit:"x",source:"UNKNOWN",overrideState:"UNKNOWN",validationStatus:"UNSUPPORTED",requiresReplan:"UNKNOWN"};
test("reusable configuration components expose Spanish text, not internal codes",()=>{
  assert.equal(sourceLabels.DAY_OVERRIDE,"Modificado para este día");
  const html=renderToStaticMarkup(<><SourceBadge source="INHERITED"/><SeverityBadge severity="REQUIRED"/><CapabilityStatus value={value}/><EffectiveValueField value={value}/><ReadinessSummary readiness={{status:"READY",issues:[]}}/></>);
  for(const text of ["Heredado","Obligatorio","Aún no soportado","Esta capacidad aún no tiene un valor productivo","Revisa sólo las excepciones del día"])assert.match(html,new RegExp(text));
  assert.doesNotMatch(html,/UNSUPPORTED|DAY_OVERRIDE/);
});
