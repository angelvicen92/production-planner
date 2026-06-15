export type RenderedPlanningCounts = {
  visibleScheduledTasksCount: number;
  visibleTransportOutCount: number;
  pendingUnplannedCount: number;
};

export type PlanningReadyGateInput = RenderedPlanningCounts & {
  currentRunId: number | null;
  latestSuccessRunId: number | null;
  diagnosticsRunId: number | null;
  expectedPlannedTasks: number | null;
  expectedUnplannedTasks: number | null;
  expectedTransportOutCount: number;
  taskDatasetVersion: string;
  renderedTaskDatasetVersion?: string | null;
  exportReady: boolean;
};

const normalize = (value: unknown): string => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

export const isTransportOutTask = (task: any): boolean => {
  const direction = normalize(task?.direction ?? task?.transportDirection ?? task?.transport_direction);
  const type = normalize(task?.type ?? task?.taskType ?? task?.task_type ?? task?.category);
  if (direction === "out" || direction === "departure" || direction === "return") return true;
  if ((type.includes("transport") || type.includes("transporte")) && /\b(out|salida|return|regreso)\b/.test(`${direction} ${type}`)) return true;
  const name = normalize(task?.template?.name ?? task?.templateName ?? task?.name);
  return /\b(out|salida|return|regreso)\b/.test(name);
};

export const countRenderedPlanningTasks = (tasks: any[]): RenderedPlanningCounts => ({
  visibleScheduledTasksCount: tasks.filter((task) => Boolean(task?.startPlanned && task?.endPlanned)).length,
  visibleTransportOutCount: tasks.filter((task) => Boolean(task?.startPlanned && task?.endPlanned) && isTransportOutTask(task)).length,
  pendingUnplannedCount: tasks.filter((task) =>
    String(task?.status ?? "pending") === "pending"
    && !task?.isManualBlock
    && !task?.is_manual_block
    && (!task?.startPlanned || !task?.endPlanned)).length,
});

export const evaluatePlanningReadyGate = (input: PlanningReadyGateInput) => {
  const missingTransportOutCount = Math.max(0, input.expectedTransportOutCount - input.visibleTransportOutCount);
  const missingScheduledTasks = input.expectedPlannedTasks === null
    ? 0
    : Math.max(0, input.expectedPlannedTasks - input.visibleScheduledTasksCount);
  const runsReady = input.currentRunId !== null
    && input.latestSuccessRunId === input.currentRunId
    && input.diagnosticsRunId === input.currentRunId;
  const pendingReady = input.expectedUnplannedTasks !== null
    && input.pendingUnplannedCount === input.expectedUnplannedTasks;
  const rendered = Boolean(input.taskDatasetVersion)
    && input.renderedTaskDatasetVersion === input.taskDatasetVersion;
  const isWaitingForTransportOutTasks = missingTransportOutCount > 0
    || (missingScheduledTasks > 0 && input.pendingUnplannedCount > (input.expectedUnplannedTasks ?? 0));
  return {
    planningReady: runsReady && pendingReady && missingScheduledTasks === 0 && missingTransportOutCount === 0 && rendered && input.exportReady,
    missingTransportOutCount,
    missingScheduledTasks,
    isWaitingForTransportOutTasks,
  };
};
