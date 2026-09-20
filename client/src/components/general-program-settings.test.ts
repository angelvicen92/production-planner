import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("./general-program-settings.tsx",import.meta.url),"utf8");

test("general settings edits and persists the complete default workday",()=>{
  assert.match(source,/defaultWorkStart:\s*string/);
  assert.match(source,/defaultWorkEnd:\s*string/);
  assert.match(source,/defaultWorkStart:\s*draft\.defaultWorkStart/);
  assert.match(source,/defaultWorkEnd:\s*draft\.defaultWorkEnd/);
  assert.match(source,/draft\.defaultWorkStart\s*>=\s*draft\.defaultWorkEnd/);
});

test("general settings labels are associated with their controls and help",()=>{
  for(const id of ["default-work-start","default-work-end","default-meal-start","default-meal-end","default-meal-mode","contestant-meal-duration","contestant-meal-capacity","space-meal-duration","automatic-clock","simulated-time","meal-task-template"]){
    assert.match(source,new RegExp(`htmlFor=["']${id}["']`),`${id} label`);
    assert.match(source,new RegExp(`id=["']${id}["']`),`${id} control`);
  }
  assert.match(source,/role="alert"/);
});
