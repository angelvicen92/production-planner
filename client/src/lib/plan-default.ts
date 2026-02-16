export function pickDefaultPlan<T extends { date?: string | null }>(plans: T[]): T | null {
  if (!plans.length) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todayPlan = plans.find((plan) => String(plan?.date || "").slice(0, 10) === today);
  if (todayPlan) return todayPlan;

  const todayTs = new Date(today).getTime();
  const sorted = [...plans].sort(
    (a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime(),
  );

  const nearestFuture = sorted.find((plan) => new Date(plan?.date || 0).getTime() >= todayTs);
  if (nearestFuture) return nearestFuture;

  return sorted.at(-1) || null;
}
