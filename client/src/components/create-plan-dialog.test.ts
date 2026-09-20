import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { planDefaultsForNewDay } from "../lib/plan-creation-defaults";

const defaults={defaultWorkStart:"09:00",defaultWorkEnd:"21:00",mealStart:"13:00",mealEnd:"16:00",mealMode:"flexible_meal_window" as const,contestantMealDurationMinutes:75,contestantMealMaxSimultaneous:10};

test("new days inherit the latest general workday while a form override remains day-local",()=>{
  const first=planDefaultsForNewDay(defaults,"2026-09-20");
  assert.deepEqual([first.workStart,first.workEnd],["09:00","21:00"]);
  const changed=planDefaultsForNewDay({...defaults,defaultWorkStart:"08:30",defaultWorkEnd:"20:30"},"2026-09-21");
  assert.deepEqual([changed.workStart,changed.workEnd],["08:30","20:30"]);
  assert.deepEqual([first.workStart,first.workEnd],["09:00","21:00"],"an existing day is unchanged");
  const override={...changed,workStart:"10:00",workEnd:"19:00"};
  assert.deepEqual([override.workStart,override.workEnd],["10:00","19:00"]);
  assert.deepEqual([changed.workStart,changed.workEnd],["08:30","20:30"],"the override affects only the submitted day");
});

test("CreatePlanDialog does not contain a hidden productive 09:00–18:00 fallback",()=>{
  const source=readFileSync(new URL("./create-plan-dialog.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(source,/workStart:\s*["']09:00["']/);
  assert.doesNotMatch(source,/workEnd:\s*["']18:00["']/);
  assert.match(source,/No se pudo cargar el horario habitual/);
  assert.match(source,/Ventana flexible de comida/);
  assert.match(source,/Parada global de comida/);
  assert.match(source,/disabled=\{!overrideMeal\}/);
});

test("Plan Details sends an explicit typed meal mode with daily edits",()=>{
  const source=readFileSync(new URL("../pages/plan-details.tsx",import.meta.url),"utf8");
  assert.match(source,/id="day-meal-mode"/);
  assert.match(source,/value="flexible_meal_window"/);
  assert.match(source,/value="global_hard_break"/);
  assert.match(source,/\.\.\.edit/);
});
