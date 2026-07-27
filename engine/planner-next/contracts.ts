export type Minute = number;
export interface Window { start: Minute; end: Minute }
export interface Person { id: string; availability: Window[] }
export interface Space { id: string; availability: Window[] }
export interface Task { id: string; kind: "main" | "vocal"; participantId: string; coachId: string; duration: number; spaceId: string; dependencies: string[]; blockKey?: string }
export interface PlannerNextProblem {
  day: Window; protectedMeal: Window; spaces: Space[]; participants: Person[]; coaches: Person[]; tasks: Task[];
  mainFlow: { spaceId: string; preferredEnd: Minute; continuity: "REQUIRED"; maxBlocksByKey: number; minTasksPerBlock: number };
  participantTransitionMinutes: number; resourceTransitionMinutes: number;
  budget: { bestK: number; maxBacktracks: number };
}
export interface ScheduledTask extends Task { start: Minute; end: Minute }
export interface ValidationSummary { hardValid: boolean; dependencyViolationCount: number; overlapViolationCount: number; transitionViolationCount: number; availabilityViolationCount: number; blockViolationCount: number; reasonCodes: string[] }
export interface PlanMetrics extends ValidationSummary {
  complete: boolean; plannedTaskCount: number; unplannedTaskCount: number; mainFlowStart: Minute | null; mainFlowEnd: Minute | null; mainFlowGapMinutes: number;
  blockSequence: string[]; blockCountByKey: Record<string, number>; participantPresenceMinutesById: Record<string, number>; totalParticipantPresenceMinutes: number; maxParticipantPresenceMinutes: number;
  alternativesGenerated: number; alternativesRetained: number; branchesExplored: number; backtracks: number; runtimeMs: number; planFingerprint: string;
}
export interface PlanResult { complete: boolean; scheduledTasks: ScheduledTask[]; metrics: PlanMetrics }
