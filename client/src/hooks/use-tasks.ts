import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { DailyTask, Lock, TaskTemplate, InsertDailyTask, InsertTaskTemplate } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { api, buildUrl } from "@shared/routes";

export function useTaskTemplates() {
  return useQuery<TaskTemplate[]>({
    queryKey: [api.taskTemplates.list.path],
    queryFn: () => apiRequest("GET", api.taskTemplates.list.path),
    retry: false,
  });
}

export function useDeleteTaskTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: number) => 
    apiRequest("DELETE", buildUrl(api.taskTemplates.delete.path, { id })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.taskTemplates.list.path] });
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete template",
        variant: "destructive"
      });
    }
  });
}

export function useUpdateTaskTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<InsertTaskTemplate> }) =>
      apiRequest<TaskTemplate>(
        "PATCH",
        buildUrl(api.taskTemplates.update.path, { id: args.id }),
        args.patch,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.taskTemplates.list.path] });
      toast({ title: "Success", description: "Template updated successfully" });
    },
    onError: (err: any) => {
      toast({
        title: "Update failed",
        description: err?.message || "Could not update template",
        variant: "destructive",
      });
    },
  });
}

export function useCreateTaskTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: InsertTaskTemplate) => 
      apiRequest<TaskTemplate>("POST", api.taskTemplates.create.path, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.taskTemplates.list.path] });
      toast({
        title: "Success",
        description: "Template created successfully",
      });
    },
  });
}

export function useTasks(planId: number) {
  return useQuery<DailyTask[]>({
    queryKey: [`/api/plans/${planId}/tasks`],
    enabled: !!planId,
    queryFn: () => apiRequest("GET", `/api/plans/${planId}/tasks`)
  });
}

export function useCreateDailyTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: InsertDailyTask) => 
      apiRequest<DailyTask>("POST", api.dailyTasks.create.path, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [buildUrl(api.plans.get.path, { id: variables.planId })] });
      queryClient.invalidateQueries({ queryKey: [`/api/plans/${variables.planId}/tasks`] });
      toast({
        title: "Task Added",
        description: "Task has been added to the plan.",
      });
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ taskId, status, startReal, endReal }: {
      taskId: number;
      status: "pending" | "in_progress" | "done" | "interrupted" | "cancelled";
      startReal?: string;
      endReal?: string;
    }) =>
      apiRequest(
        "PATCH",
        buildUrl(api.dailyTasks.updateStatus.path, { id: taskId }),
        { status, startReal, endReal }
      ),

    onSuccess: (data: any) => {
      const planId = data?.planId ?? data?.plan_id;
      if (planId) {
        queryClient.invalidateQueries({ queryKey: [buildUrl(api.plans.get.path, { id: planId })] });
        queryClient.invalidateQueries({ queryKey: [`/api/plans/${planId}/tasks`] });
        queryClient.invalidateQueries({ queryKey: [`/api/plans/${planId}/locks`] });
      }

      toast({
        title: "Task Updated",
        description: `Status changed to ${data.status}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo actualizar la tarea",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });
}

export function useLocks(planId: number) {
  return useQuery<Lock[]>({
    queryKey: [`/api/plans/${planId}/locks`],
    enabled: !!planId,
    queryFn: () => apiRequest("GET", `/api/plans/${planId}/locks`)
  });
}

type ContestantUI = {
  id: number;
  planId: number | null;
  name: string;
  instrument: boolean;
  instrumentName?: string | null;

  coachId: number | null; // legacy
  song: string | null;

  notes?: string | null;
  availabilityStart?: string | null;
  availabilityEnd?: string | null;

  vocalCoachPlanResourceItemId: number | null;

  createdAt: string | null;
};

export function useContestants(planId: number) {
  return useQuery<ContestantUI[]>({
    queryKey: ["contestants", planId],
    queryFn: () => apiRequest("GET", `/api/plans/${planId}/contestants`),
    enabled: !!planId,
  });
}

export function useCreateContestant(planId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      instrument: boolean;
      instrumentName?: string | null;

      song?: string | null;
      notes?: string | null;

      availabilityStart?: string | null;
      availabilityEnd?: string | null;

      vocalCoachPlanResourceItemId?: number | null;
    }) => apiRequest("POST", `/api/plans/${planId}/contestants`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contestants", planId] });

      // ✅ refresca plan para que aparezca la Daily Task "Comer" sin recargar
      queryClient.invalidateQueries({
        queryKey: [buildUrl(api.plans.get.path, { id: planId })],
      });

      // por si alguna vista usa el endpoint de tasks suelto
      queryClient.invalidateQueries({ queryKey: [`/api/plans/${planId}/tasks`] });
    },
  });
}

export function useUpdateContestant(planId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (args: {
      contestantId: number;
      patch: {
        song?: string | null;
        vocalCoachPlanResourceItemId?: number | null;

        instrument?: boolean;
        instrumentName?: string | null;

        notes?: string | null;

        availabilityStart?: string | null;
        availabilityEnd?: string | null;
      };
    }) =>
      apiRequest(
        "PATCH",
        buildUrl(api.plans.contestants.update.path, {
          id: planId,
          contestantId: args.contestantId,
        }),
        args.patch,
      ),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contestants", planId] });
      queryClient.invalidateQueries({ queryKey: [buildUrl(api.plans.get.path, { id: planId })] });
      toast({ title: "Guardado" });
    },

    onError: (err: any) => {
      toast({
        title: "No se pudo guardar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
  });
}

