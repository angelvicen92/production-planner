import { createHash } from "node:crypto";

export interface ParticipantMealFingerprintInput {
  readonly id: string;
  readonly sourceTaskId: string;
  readonly participantId: string;
  readonly duration: number;
  readonly start: number;
  readonly end: number;
}

export function participantMealWitnessFingerprint(meals: readonly ParticipantMealFingerprintInput[]): string {
  const canonicalMeals = [...meals]
    .sort((left, right) => left.sourceTaskId.localeCompare(right.sourceTaskId))
    .map(({ id, sourceTaskId, participantId, duration, start, end }) => ({ id, sourceTaskId, participantId, duration, start, end }));
  return createHash("sha256").update(JSON.stringify(canonicalMeals)).digest("hex");
}
