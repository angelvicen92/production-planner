import type {
  EngineInput,
  EngineInputRoundSynchronizationInput,
} from "../../types";

export interface SupportedEngineInputRoundSynchronization {
  id: string;
  lanes: readonly {
    spaceId: number;
    taskIds: readonly number[];
    preparationMinutesBetweenRounds: number;
  }[];
  synchronization: "START_TOGETHER_WHILE_ALL_LANES_ACTIVE";
}

export interface EngineInputRoundSynchronizationDefect {
  index: number;
  details: Readonly<Record<string, unknown>>;
}

const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
const nonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export function projectEngineInputRoundSynchronizations(input: EngineInput): unknown {
  const value = (input as unknown as Record<string, unknown>).roundSynchronizations;
  return Array.isArray(value) && value.length === 0 ? undefined : value;
}

export function resolveEngineInputRoundSynchronizations(
  input: EngineInput,
  timeGridMinutes: unknown,
): {
  present: boolean;
  invalidContainer: boolean;
  synchronizations: readonly SupportedEngineInputRoundSynchronization[];
  defects: readonly EngineInputRoundSynchronizationDefect[];
} {
  const runtime = input as unknown as Record<string, unknown>;
  const present = Object.prototype.hasOwnProperty.call(runtime, "roundSynchronizations");
  const value = runtime.roundSynchronizations;
  const invalidContainer = present && value !== undefined && !Array.isArray(value);
  const entries = Array.isArray(value) ? value : [];
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const spaceIds = new Set((input.planSpaceSettings ?? []).map(({ spaceId }) => spaceId));
  const policyIds = new Set<string>();
  const globallyUsedTaskIds = new Set<number>();
  const globallyUsedSpaceIds = new Set<number>();
  const synchronizations: SupportedEngineInputRoundSynchronization[] = [];
  const defects: EngineInputRoundSynchronizationDefect[] = [];

  entries.forEach((raw, index) => {
    const policy = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
    const id = policy.id;
    const lanesRaw = policy.lanes;
    const synchronization = policy.synchronization;
    const idValid = typeof id === "string" && id !== "" && id.trim() === id;
    const duplicateId = idValid && policyIds.has(id);
    if (idValid) policyIds.add(id);
    const lanesValidContainer = Array.isArray(lanesRaw) && lanesRaw.length === 2;
    const localSpaceIds = new Set<number>();
    const localTaskIds = new Set<number>();
    const durations = new Set<number>();
    const lanes: SupportedEngineInputRoundSynchronization["lanes"][number][] = [];
    const laneDefects: Array<Record<string, unknown>> = [];

    for (const [laneIndex, rawLane] of (Array.isArray(lanesRaw) ? lanesRaw : []).entries()) {
      const lane = rawLane && typeof rawLane === "object" && !Array.isArray(rawLane)
        ? rawLane as Record<string, unknown>
        : {};
      const spaceId = lane.spaceId;
      const taskIds = lane.taskIds;
      const preparationMinutesBetweenRounds = lane.preparationMinutesBetweenRounds;
      const spaceValid = positiveInteger(spaceId) && spaceIds.has(spaceId);
      const duplicateSpace = positiveInteger(spaceId)
        && (localSpaceIds.has(spaceId) || globallyUsedSpaceIds.has(spaceId));
      if (positiveInteger(spaceId)) localSpaceIds.add(spaceId);
      const taskIdsContainerValid = Array.isArray(taskIds) && taskIds.length > 0;
      const canonicalTaskIds: number[] = [];
      const taskDefects: Array<Record<string, unknown>> = [];

      for (const taskId of Array.isArray(taskIds) ? taskIds : []) {
        const task = positiveInteger(taskId) ? taskById.get(taskId) : undefined;
        const duplicateTask = positiveInteger(taskId)
          && (localTaskIds.has(taskId) || globallyUsedTaskIds.has(taskId));
        if (positiveInteger(taskId)) localTaskIds.add(taskId);
        const duration = task?.durationOverrideMin;
        const taskValid = Boolean(
          task
          && (task.status === "pending" || task.status === "interrupted")
          && task.plannerNextKind === "auxiliary"
          && positiveInteger(task.contestantId)
          && task.spaceId === spaceId
          && task.jointGroupId == null
          && task.setupFamilyId == null
          && positiveInteger(duration)
          && (!positiveInteger(timeGridMinutes) || duration % timeGridMinutes === 0),
        );
        if (taskValid) durations.add(duration as number);
        if (!positiveInteger(taskId) || duplicateTask || !taskValid) {
          taskDefects.push({
            taskId,
            duplicateTask,
            taskFound: Boolean(task),
            status: task?.status ?? null,
            plannerNextKind: task?.plannerNextKind ?? null,
            contestantId: task?.contestantId ?? null,
            taskSpaceId: task?.spaceId ?? null,
            laneSpaceId: spaceId,
            duration: duration ?? null,
          });
        } else {
          canonicalTaskIds.push(taskId);
        }
      }

      const preparationValid = nonNegativeInteger(preparationMinutesBetweenRounds)
        && (!positiveInteger(timeGridMinutes)
          || preparationMinutesBetweenRounds % timeGridMinutes === 0);
      if (!spaceValid || duplicateSpace || !taskIdsContainerValid
        || taskDefects.length > 0 || !preparationValid) {
        laneDefects.push({
          laneIndex,
          spaceId,
          spaceValid,
          duplicateSpace,
          taskIdsContainerValid,
          taskDefects,
          preparationMinutesBetweenRounds,
          preparationValid,
        });
      } else {
        lanes.push({
          spaceId: spaceId as number,
          taskIds: Object.freeze([...canonicalTaskIds].sort((left, right) => left - right)),
          preparationMinutesBetweenRounds: preparationMinutesBetweenRounds as number,
        });
      }
    }

    const durationMixValid = durations.size === 1;
    const synchronizationValid =
      synchronization === "START_TOGETHER_WHILE_ALL_LANES_ACTIVE";
    const valid = idValid && !duplicateId && lanesValidContainer
      && lanes.length === 2 && laneDefects.length === 0
      && durationMixValid && synchronizationValid;

    if (!valid) {
      defects.push({
        index,
        details: {
          id,
          idValid,
          duplicateId,
          lanesValidContainer,
          laneDefects,
          durationMixValid,
          durations: [...durations].sort((left, right) => left - right),
          synchronization,
          synchronizationValid,
        },
      });
      return;
    }

    for (const lane of lanes) {
      globallyUsedSpaceIds.add(lane.spaceId);
      lane.taskIds.forEach((taskId) => globallyUsedTaskIds.add(taskId));
    }
    synchronizations.push({
      id: id as string,
      lanes: Object.freeze([...lanes].sort((left, right) => left.spaceId - right.spaceId)),
      synchronization: "START_TOGETHER_WHILE_ALL_LANES_ACTIVE",
    });
  });

  return {
    present,
    invalidContainer,
    synchronizations: Object.freeze(
      [...synchronizations].sort((left, right) => left.id.localeCompare(right.id, "en")),
    ),
    defects: Object.freeze(defects),
  };
}

export type { EngineInputRoundSynchronizationInput };
