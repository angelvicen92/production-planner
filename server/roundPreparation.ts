import { z } from "zod";
import type { EngineInput } from "../engine/types";
import { roundPreparationOverrideSchema, type RoundPreparationOverride, type RoundPreparationTarget, type RoundPreparationValue } from "../shared/roundPreparation";
import { planPlannerNextConfigurationSchema } from "./planPlannerNextConfiguration";

const conflict = () => Object.assign(new Error("ROUND_PREPARATION_CONFIGURATION_CONFLICT"), { status: 409 });
const original = (row: Record<string, any>) => row.planner_next_configuration ?? row.plannerNextConfiguration;
export function roundPreparationOverrides(row: Record<string, any>): RoundPreparationOverride[] {
  const parsed = z.array(roundPreparationOverrideSchema).safeParse(row.round_preparation_overrides ?? []);
  if (!parsed.success) throw conflict();
  const keys = parsed.data.map(value => JSON.stringify([value.policyId, value.spaceId]));
  if (new Set(keys).size !== keys.length) throw conflict();
  return parsed.data;
}
function baselineLane(input: EngineInput, row: Record<string, any>, target: RoundPreparationTarget) {
  const parsed = planPlannerNextConfigurationSchema.safeParse(original(row));
  if (!parsed.success) throw conflict();
  const matches = parsed.data.roundSynchronizations.filter(policy => policy.id === target.policyId);
  if (matches.length !== 1) throw conflict();
  const lanes = matches[0].lanes.filter(lane => lane.spaceId === target.spaceId);
  if (lanes.length !== 1 || !lanes[0].taskIds.length || !input.planSpaceSettings?.some(space => space.spaceId === target.spaceId)
    || lanes[0].taskIds.some(id => !input.tasks.some(task => task.id === id && task.spaceId === target.spaceId))) throw conflict();
  return lanes[0];
}

/** The protected daily snapshot is the baseline; only minutes may be overlaid. */
export function applyEffectiveRoundPreparations(input: EngineInput, row: Record<string, any>): EngineInput {
  const overrides = roundPreparationOverrides(row);
  if (!overrides.length) return input; // Preserve historical input and fingerprints.
  for (const override of overrides) baselineLane(input, row, override);
  const raw = planPlannerNextConfigurationSchema.parse(original(row));
  return { ...input, roundSynchronizations: raw.roundSynchronizations.map(policy => ({ ...policy,
    lanes: policy.lanes.map(lane => ({ ...lane, preparationMinutesBetweenRounds: overrides.find(value => value.policyId === policy.id && value.spaceId === lane.spaceId)?.preparationMinutesBetweenRounds ?? lane.preparationMinutesBetweenRounds })),
  })) };
}

export function roundPreparationValues(input: EngineInput, row: Record<string, any>): RoundPreparationValue[] {
  if (!original(row)) return [];
  const overrides = roundPreparationOverrides(row);
  return (input.roundSynchronizations ?? []).flatMap(policy => policy.lanes.map(lane => {
    const target = { policyId: policy.id, spaceId: lane.spaceId };
    const baseline = baselineLane(input, row, target);
    const override = overrides.find(value => value.policyId === policy.id && value.spaceId === lane.spaceId);
    if (lane.preparationMinutesBetweenRounds !== (override?.preparationMinutesBetweenRounds ?? baseline.preparationMinutesBetweenRounds)) throw conflict();
    return { ...target, spaceName: input.planSpaceSettings?.find(space => space.spaceId === lane.spaceId)?.name ?? "Espacio sin nombre",
      taskCount: lane.taskIds.length, baselineMinutes: baseline.preparationMinutesBetweenRounds,
      preparationMinutesBetweenRounds: lane.preparationMinutesBetweenRounds,
      source: override ? "DAY_OVERRIDE" as const : "DAY_SNAPSHOT" as const,
      overrideMetadata: override ? { createdBy: override.by, createdAt: override.at } : null };
  }));
}

export function candidateRoundPreparations(input: EngineInput, row: Record<string, any>, target: RoundPreparationTarget,
  minutes: number | undefined, actorId: string): EngineInput {
  const baseline = baselineLane(input, row, target);
  const overrides = roundPreparationOverrides(row);
  const existing = overrides.find(value => value.policyId === target.policyId && value.spaceId === target.spaceId);
  if (minutes === undefined && !existing) throw Object.assign(new Error("ROUND_PREPARATION_RESTORE_NOT_AVAILABLE"), { status: 409 });
  if (minutes !== undefined && minutes === (existing?.preparationMinutesBetweenRounds ?? baseline.preparationMinutesBetweenRounds))
    throw Object.assign(new Error("ROUND_PREPARATION_NO_CHANGES"), { status: 409 });
  const next = overrides.filter(value => value.policyId !== target.policyId || value.spaceId !== target.spaceId);
  if (minutes !== undefined) next.push({ ...target, preparationMinutesBetweenRounds: minutes, by: actorId, at: new Date().toISOString() });
  // Reapply from the original snapshot, including when the last override is removed.
  const baselineInput = { ...input, roundSynchronizations: planPlannerNextConfigurationSchema.parse(original(row)).roundSynchronizations };
  return applyEffectiveRoundPreparations(baselineInput, { ...row, round_preparation_overrides: next });
}
