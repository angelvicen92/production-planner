import assert from "node:assert/strict";
import { calculateRestrictiveTalentUrgency } from "./operationalPriority";

const base = {
  workDayStartMin: 9 * 60,
  workDayEndMin: 13 * 60,
  availabilityStartMin: 9 * 60,
  taskDurationMin: 30,
  remainingDurationMin: 60,
};

{
  const earlyExit = calculateRestrictiveTalentUrgency({ ...base, availabilityEndMin: 10 * 60 });
  const flexible = calculateRestrictiveTalentUrgency({ ...base, availabilityEndMin: 13 * 60 });
  assert.ok(earlyExit > flexible, "talent that ends earlier has higher urgency than flexible talent");
}

{
  const tightSlack = calculateRestrictiveTalentUrgency({ ...base, availabilityEndMin: 10 * 60, remainingDurationMin: 55 });
  const looseSlack = calculateRestrictiveTalentUrgency({ ...base, availabilityEndMin: 10 * 60, remainingDurationMin: 25 });
  assert.ok(tightSlack > looseSlack, "less slack increases urgency");
}

{
  const values = Array.from({ length: 5 }, () => calculateRestrictiveTalentUrgency({ ...base, availabilityEndMin: 10 * 60, remainingDurationMin: 55, feedsMainStage: true }));
  assert.ok(values.every((value) => Number.isFinite(value) && !Number.isNaN(value)), "urgency is always finite");
  assert.deepEqual(values, [values[0], values[0], values[0], values[0], values[0]], "urgency is deterministic");
}

console.log("engine/v3/operationalPriority.spec.ts: OK");
