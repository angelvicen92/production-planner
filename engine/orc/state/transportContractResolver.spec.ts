import test from "node:test";
import assert from "node:assert/strict";
import { resolveORCTransportContract } from "./transportContractResolver";

test("resolveORCTransportContract reads structured transport settings", () => {
  const contract = resolveORCTransportContract({ settings: { transport: { arrivalTemplateId: 10, departureTemplateId: "20", arrivalTargetGroupSize: 3, departureTargetGroupSize: 4, arrivalMinGapMinutes: 35, departureMinGapMinutes: 20, vehicleCapacity: 6, groupingWeight: 3 } } } as any);
  assert.equal(contract.configured, true);
  assert.equal(contract.arrivalTemplateId, 10);
  assert.equal(contract.departureTemplateId, "20");
  assert.equal(contract.vehicleCapacity, 6);
  assert.equal(contract.source, "settings.transport");
  assert.deepEqual(contract.warnings, []);
});

test("resolveORCTransportContract defaults missing capacity conservatively", () => {
  const contract = resolveORCTransportContract({ transportSettings: { arrivalTemplateId: 10 } } as any);
  assert.equal(contract.configured, true);
  assert.equal(contract.vehicleCapacity, 1);
  assert.ok(contract.warnings.includes("transport_capacity_missing"));
});

test("resolveORCTransportContract does not invent unconfigured templates", () => {
  const contract = resolveORCTransportContract({} as any);
  assert.equal(contract.configured, false);
  assert.equal(contract.arrivalTemplateId, null);
  assert.ok(contract.warnings.includes("transport_template_occupancy_not_configured"));
});
