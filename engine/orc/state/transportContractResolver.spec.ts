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

test("resolveORCTransportContract reads real buildInput top-level transport fields by configured names", () => {
  const input = { arrivalTaskTemplateName: "IN", departureTaskTemplateName: "OUT", arrivalGroupingTarget: 3, departureGroupingTarget: 3, arrivalMinGapMinutes: 35, departureMinGapMinutes: 20, vanCapacity: 6, transportVanCapacity: 6, transportSpaceId: 49, optimizerWeights: { arrivalDepartureGrouping: 3 } } as any;
  const before = JSON.stringify(input);
  const first = resolveORCTransportContract(input);
  const second = resolveORCTransportContract(input);
  assert.equal(first.configured, true);
  assert.equal(first.arrivalTemplateName, "IN");
  assert.equal(first.departureTemplateName, "OUT");
  assert.equal(first.arrivalTargetGroupSize, 3);
  assert.equal(first.departureTargetGroupSize, 3);
  assert.equal(first.arrivalMinGapMinutes, 35);
  assert.equal(first.departureMinGapMinutes, 20);
  assert.equal(first.vehicleCapacity, 6);
  assert.equal(first.transportSpaceId, 49);
  assert.equal(first.groupingWeight, 3);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.doesNotThrow(() => JSON.stringify(first));
});

test("resolveORCTransportContract reads transportSettings before nested contracts and names without capacity", () => {
  const contract = resolveORCTransportContract({ transportSettings: { arrivalTemplateName: "Configured Arrival" }, settings: { transport: { arrivalTemplateId: 999, vehicleCapacity: 9 } } } as any);
  assert.equal(contract.configured, true);
  assert.equal(contract.arrivalTemplateName, "Configured Arrival");
  assert.equal(contract.arrivalTemplateId, null);
  assert.equal(contract.vehicleCapacity, 1);
  assert.ok(contract.warnings.includes("transport_capacity_missing"));
  assert.equal(contract.source, "transportSettings");
});
