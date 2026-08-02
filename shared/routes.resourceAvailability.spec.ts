import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { api } from "./routes";

const listResponse = api.plans.resourceItems.list.responses[200];
const createInput = api.plans.resourceItems.create.input;
const updateInput = api.plans.resourceItems.update.input;

function listItem(availabilityStart: string | null, availabilityEnd: string | null) {
  return {
    id: 1,
    planId: 2,
    typeId: 3,
    resourceItemId: 4,
    name: "Recurso",
    isAvailable: true,
    availabilityStart,
    availabilityEnd,
    source: "default",
    type: { id: 3, code: "camera", name: "Cámara" },
  };
}

test("list response preserves an explicit availability window", () => {
  const parsed = listResponse.parse([listItem("09:00", "17:00")]);
  assert.equal(parsed[0].availabilityStart, "09:00");
  assert.equal(parsed[0].availabilityEnd, "17:00");
});

test("list response preserves both required full-workday nulls", () => {
  const parsed = listResponse.parse([listItem(null, null)]);
  assert.equal(parsed[0].availabilityStart, null);
  assert.equal(parsed[0].availabilityEnd, null);
  assert.equal(Object.hasOwn(parsed[0], "availabilityStart"), true);
  assert.equal(Object.hasOwn(parsed[0], "availabilityEnd"), true);
});

test("list response rejects either missing availability field", () => {
  const item = listItem(null, null);
  const { availabilityStart: _start, ...withoutStart } = item;
  const { availabilityEnd: _end, ...withoutEnd } = item;
  assert.throws(() => listResponse.parse([withoutStart]));
  assert.throws(() => listResponse.parse([withoutEnd]));
});

test("create accepts omitted, full-workday, and explicit windows", () => {
  assert.deepEqual(createInput.parse({ typeId: 2, name: "Recurso" }), {
    typeId: 2, name: "Recurso",
  });
  assert.doesNotThrow(() => createInput.parse({
    typeId: 2, name: "Recurso", availabilityStart: null, availabilityEnd: null,
  }));
  assert.doesNotThrow(() => createInput.parse({
    typeId: 2, name: "Recurso", availabilityStart: "09:00", availabilityEnd: "17:30",
  }));
});

test("create rejects partial and mixed availability pairs", () => {
  for (const availability of [
    { availabilityStart: "09:00" },
    { availabilityEnd: "17:00" },
    { availabilityStart: null, availabilityEnd: "17:00" },
    { availabilityStart: "09:00", availabilityEnd: null },
  ]) {
    assert.throws(() => createInput.parse({ typeId: 2, name: "Recurso", ...availability }));
  }
});

test("create rejects invalid formats and invalid ordering", () => {
  for (const [availabilityStart, availabilityEnd] of [
    ["9:00", "17:00"],
    ["24:00", "25:00"],
    ["08:60", "17:00"],
    ["", "17:00"],
    ["09:00", "09:00"],
    ["17:00", "09:00"],
    ["22:00", "02:00"],
  ]) {
    assert.throws(() => createInput.parse({
      typeId: 2, name: "Recurso", availabilityStart, availabilityEnd,
    }));
  }
});

test("create rejects non-string values and extra properties", () => {
  for (const invalid of [9, ["09:00"], { time: "09:00" }]) {
    assert.throws(() => createInput.parse({
      typeId: 2, name: "Recurso", availabilityStart: invalid, availabilityEnd: "17:00",
    }));
  }
  assert.throws(() => createInput.parse({ typeId: 2, name: "Recurso", extra: true }));
});

test("update independently accepts name and isAvailable", () => {
  assert.deepEqual(updateInput.parse({ name: "Nuevo nombre" }), { name: "Nuevo nombre" });
  assert.deepEqual(updateInput.parse({ isAvailable: false }), { isAvailable: false });
  assert.deepEqual(updateInput.parse({ name: "Nuevo nombre", isAvailable: false }), {
    name: "Nuevo nombre", isAvailable: false,
  });
});

test("update accepts full-workday and explicit windows", () => {
  assert.doesNotThrow(() => updateInput.parse({ availabilityStart: null, availabilityEnd: null }));
  assert.doesNotThrow(() => updateInput.parse({
    availabilityStart: "10:00", availabilityEnd: "14:00",
  }));
});

test("update rejects partial, mixed, malformed, inverted, and extra input", () => {
  for (const invalid of [
    { availabilityStart: "10:00" },
    { availabilityEnd: "14:00" },
    { availabilityStart: null, availabilityEnd: "14:00" },
    { availabilityStart: "10:00", availabilityEnd: null },
    { availabilityStart: "10:0", availabilityEnd: "14:00" },
    { availabilityStart: "14:00", availabilityEnd: "10:00" },
    { availabilityStart: "10:00", availabilityEnd: "10:00" },
    { extra: true },
  ]) {
    assert.throws(() => updateInput.parse(invalid));
  }
});

test("runtime routes use only the authoritative shared create and update inputs", () => {
  const source = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.match(source, /api\.plans\.resourceItems\.create\.input\.parse\(req\.body\)/);
  assert.match(source, /api\.plans\.resourceItems\.update\.input\.parse\(req\.body\)/);
  assert.doesNotMatch(source, /const availabilityWindowFields/);
  assert.doesNotMatch(source, /hasEitherAvailabilityField/);
});
