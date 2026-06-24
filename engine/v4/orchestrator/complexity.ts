import type { EngineInput, TaskInput } from "../../types";
import type { V4StrategicAnalysis } from "../analysis";

export type V4ScenarioComplexityLevel = "SIMPLE" | "NORMAL" | "COMPLEX";

export interface V4ScenarioComplexityAssessment {
  level: V4ScenarioComplexityLevel;
  taskCount: number;
  mainFlowTaskCount: number;
  criticalResourceCount: number;
  criticalTalentCount: number;
  continuousSpaceCount: number;
  reason: string;
}

const pendingTasks = (input: EngineInput): TaskInput[] => (input.tasks ?? []).filter((task) => String(task.status ?? "pending").toLowerCase() === "pending");
const dependencyCount = (task: TaskInput): number => [
  ...(Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : []),
  ...(Array.isArray(task.dependsOnTemplateIds) ? task.dependsOnTemplateIds : []),
  task.dependsOnTaskId,
  task.dependsOnTemplateId,
].filter((value) => Number.isFinite(Number(value))).length;

export function assessV4ScenarioComplexity(input: EngineInput, strategicAnalysis: V4StrategicAnalysis): V4ScenarioComplexityAssessment {
  const tasks = pendingTasks(input);
  const taskCount = tasks.length;
  const mainFlowId = Number(strategicAnalysis.mainFlow?.id);
  const mainFlowTaskCount = Number.isFinite(mainFlowId)
    ? tasks.filter((task) => Number(task.zoneId) === mainFlowId || Number(task.spaceId) === mainFlowId).length
    : 0;
  const criticalResourceCount = (strategicAnalysis.criticalResources ?? []).filter((resource) => resource.pressureScore >= 60).length;
  const criticalTalentCount = (strategicAnalysis.criticalTalents ?? []).filter((talent) => talent.pressureScore >= 60).length;
  const continuousSpaceCount = (strategicAnalysis.continuousSpaces ?? []).filter((space) => space.estimatedOccupancy >= 0.35 || space.totalLoadMinutes >= 90).length;
  const totalDependencyCount = tasks.reduce((sum, task) => sum + dependencyCount(task), 0);
  const highPressure = strategicAnalysis.riskScore === "HIGH" || strategicAnalysis.riskScore === "CRITICAL" || Math.max(strategicAnalysis.pressureScores?.resourcePressureScore ?? 0, strategicAnalysis.pressureScores?.spacePressureScore ?? 0, strategicAnalysis.pressureScores?.talentPressureScore ?? 0) >= 70;

  const simpleSignals = [
    taskCount < 10,
    mainFlowTaskCount < 3,
    criticalResourceCount <= 1,
    criticalTalentCount <= 1,
    totalDependencyCount <= 1,
    continuousSpaceCount === 0,
    !highPressure,
  ];
  const simpleScore = simpleSignals.filter(Boolean).length;
  const complexSignals = [taskCount >= 40, mainFlowTaskCount >= 8, criticalResourceCount >= 3, criticalTalentCount >= 3, totalDependencyCount >= 8, continuousSpaceCount >= 1, highPressure];
  const complexScore = complexSignals.filter(Boolean).length;

  const level: V4ScenarioComplexityLevel = simpleScore >= 5 ? "SIMPLE" : complexScore >= 3 ? "COMPLEX" : "NORMAL";
  const reason = level === "SIMPLE"
    ? "Scenario too small for V4 strategic pipeline."
    : level === "COMPLEX"
      ? "Scenario has enough tasks, main-flow pressure, dependencies, continuous spaces, or critical resources for V4 strategic pipeline."
      : "Scenario has moderate operational complexity for V4 strategic pipeline.";

  return { level, taskCount, mainFlowTaskCount, criticalResourceCount, criticalTalentCount, continuousSpaceCount, reason };
}
