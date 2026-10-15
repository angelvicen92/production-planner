export const planningViews = ["contestants", "spaces", "resources"] as const;
export type PlanningView = (typeof planningViews)[number];
export type PlanningLayout = "horizontal" | "vertical" | "grid";
export function normalizedPlanningViews(value: unknown): PlanningView[] {
  const views = Array.isArray(value)
    ? [...new Set(value.filter((view): view is PlanningView => planningViews.includes(view)))]
    : [];
  return views.length ? views : ["contestants"];
}
export function toggledPlanningViews(
  visible: PlanningView[],
  view: PlanningView,
): PlanningView[] {
  return normalizedPlanningViews(
    visible.includes(view)
      ? visible.length === 1
        ? visible
        : visible.filter((item) => item !== view)
      : [...visible, view],
  );
}
