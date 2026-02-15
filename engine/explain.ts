export function explainInfeasibility(reasons: any[]) {
  // TODO: Transform technical error codes into user-friendly messages
  return reasons.map(r => `Conflict in ${r.taskId}: ${r.message}`);
}
