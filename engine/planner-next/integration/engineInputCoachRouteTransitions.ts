import type { EngineInput } from "../../types";

export interface SupportedEngineInputCoachRouteTransition {
  coachPlanResourceItemId: number;
  fromSpaceId: number;
  toSpaceId: number;
  minutes: number;
}

export interface EngineInputCoachRouteTransitionDefect {
  index: number;
  details: Readonly<Record<string, unknown>>;
}

const positiveInteger = (value: unknown): value is number =>
  typeof value === "number"
  && Number.isInteger(value)
  && value > 0;

export function projectEngineInputCoachRouteTransitions(
  input: EngineInput,
): unknown {
  const runtime = input as unknown as Record<string, unknown>;
  const value = runtime.coachRouteTransitions;
  return Array.isArray(value) && value.length === 0 ? undefined : value;
}

export function resolveEngineInputCoachRouteTransitions(
  input: EngineInput,
  timeGridMinutes: unknown,
  configuredCoachIds: ReadonlySet<number>,
): {
  present: boolean;
  invalidContainer: boolean;
  routes: readonly SupportedEngineInputCoachRouteTransition[];
  defects: readonly EngineInputCoachRouteTransitionDefect[];
} {
  const runtime = input as unknown as Record<string, unknown>;
  const present = Object.prototype.hasOwnProperty.call(runtime, "coachRouteTransitions");
  const value = runtime.coachRouteTransitions;
  const invalidContainer = present && value !== undefined && !Array.isArray(value);
  const entries = Array.isArray(value) ? value : [];
  const planResourceIds = new Set(input.planResourceItems.map(({ id }) => id));
  const spaceIds = new Set((input.planSpaceSettings ?? []).map(({ spaceId }) => spaceId));
  const keys = new Set<string>();
  const routes: SupportedEngineInputCoachRouteTransition[] = [];
  const defects: EngineInputCoachRouteTransitionDefect[] = [];

  entries.forEach((raw, index) => {
    const route = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
    const coachPlanResourceItemId = route.coachPlanResourceItemId;
    const fromSpaceId = route.fromSpaceId;
    const toSpaceId = route.toSpaceId;
    const minutes = route.minutes;
    const coachValid = positiveInteger(coachPlanResourceItemId)
      && planResourceIds.has(coachPlanResourceItemId)
      && configuredCoachIds.has(coachPlanResourceItemId);
    const fromValid = positiveInteger(fromSpaceId) && spaceIds.has(fromSpaceId);
    const toValid = positiveInteger(toSpaceId) && spaceIds.has(toSpaceId);
    const minutesValid = positiveInteger(minutes)
      && (!positiveInteger(timeGridMinutes) || minutes % timeGridMinutes === 0);
    const directionValid = fromValid && toValid && fromSpaceId !== toSpaceId;
    const key =
      `${String(coachPlanResourceItemId)}\0${String(fromSpaceId)}\0${String(toSpaceId)}`;
    const duplicate = keys.has(key);
    keys.add(key);

    if (!coachValid || !fromValid || !toValid || !minutesValid || !directionValid || duplicate) {
      defects.push({
        index,
        details: {
          coachPlanResourceItemId,
          fromSpaceId,
          toSpaceId,
          minutes,
          coachValid,
          fromValid,
          toValid,
          minutesValid,
          directionValid,
          duplicate,
        },
      });
      return;
    }

    routes.push({
      coachPlanResourceItemId: coachPlanResourceItemId as number,
      fromSpaceId: fromSpaceId as number,
      toSpaceId: toSpaceId as number,
      minutes: minutes as number,
    });
  });

  return {
    present,
    invalidContainer,
    routes: Object.freeze(routes),
    defects: Object.freeze(defects),
  };
}
