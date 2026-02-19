import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { api } from "@shared/routes";

export type ControlRoomSettings = {
  id: number;
  idleUnexpectedThresholdMin: number;
  delayThresholdMin: number;
  nextSoonThresholdMin: number;
  enableIdleAlert: boolean;
  enableDelayAlert: boolean;
  enableNextSoonAlert: boolean;
  updatedAt: string;
};

export function useControlRoomSettings() {
  return useQuery<ControlRoomSettings>({
    queryKey: [api.controlRoomSettings.get.path],
    queryFn: () => apiRequest("GET", api.controlRoomSettings.get.path),
  });
}

export function useUpdateControlRoomSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: Partial<ControlRoomSettings>) =>
      apiRequest("PATCH", api.controlRoomSettings.update.path, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.controlRoomSettings.get.path] });
    },
  });
}
