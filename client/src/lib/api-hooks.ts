import { apiRequest } from "@/lib/api";

export async function patchManualBlock(taskId: number, patch: { title?: string | null; color?: string | null }) {
  return apiRequest("PATCH", `/api/daily-tasks/${taskId}/manual-block`, patch);
}
