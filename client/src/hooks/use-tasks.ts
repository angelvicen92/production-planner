import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { DailyTask, Lock, TaskTemplate, InsertDailyTask } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { api, buildUrl, type CreateTaskTemplateInput, type UpdateTaskTemplateInput } from "@shared/routes";
import { contestantsQueryKey, planLocksQueryKey, planQueryKey, planTasksQueryKey } from "@/lib/plan-query-keys";

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
    mutationFn: (args: { id: number; patch: UpdateTaskTemplateInput }) =>
      apiRequest<TaskTemplate>(
        "PATCH",
        buildUrl(api.taskTemplates.update.path, { id: args.id }),
        api.taskTemplates.update.input.parse(args.patch),
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
    mutationFn: (data: CreateTaskTemplateInput) =>
      apiRequest<TaskTemplate>("POST", api.taskTemplates.create.path, api.taskTemplates.create.input.parse(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.taskTemplates.list.path] });
      toast({
        title: "Success",
        description: "Template created successfully",
      });
    },
    onError: (err: Error) => toast({title: "No se pudo crear la plantilla", description: err.message, variant: "destructive"}),
  });
}

export function useTasks(planId: number) {
  return useQuery<DailyTask[]>({
    queryKey: planTasksQueryKey(planId),
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
    onMutate: async (variables) => {
      const key = planQueryKey(variables.planId);
      await queryClient.cancelQueries({ queryKey: key });
      const previousPlan = queryClient.getQueryData(key);

      const optimisticId = -Date.now();
      queryClient.setQueryData(key, (old: any) => {
        if (!old) return old;
        const nextTask = {
          ...variables,
          id: optimisticId,
          status: "pending",
        };
        const tasks = Array.isArray(old.dailyTasks) ? old.dailyTasks : [];
        return { ...old, dailyTasks: [...tasks, nextTask] };
      });

      return { previousPlan, planId: variables.planId, optimisticId };
    },
    onError: (_err, _variables, ctx) => {
      if (ctx?.previousPlan) {
        queryClient.setQueryData(planQueryKey(ctx.planId), ctx.previousPlan);
      }
    },
    onSuccess: () => toast({title:"Tarea añadida",description:"La tarea se ha guardado en esta jornada."}),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: planQueryKey(variables.planId) });
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ taskId, planId, status, expectedStatus }: {
      taskId: number;
      planId: number;
      status: "pending" | "in_progress" | "done" | "interrupted" | "cancelled";
      expectedStatus?: string;
      effectiveTimeHHMM?: string;
      effectiveSeconds?: number;
    }) => {
      const task = queryClient.getQueryData<any[]>(planTasksQueryKey(planId))?.find(t => Number(t.id) === taskId)
        ?? queryClient.getQueryData<any>(planQueryKey(planId))?.dailyTasks?.find((t: any) => Number(t.id) === taskId);
      return apiRequest("PATCH", buildUrl(api.dailyTasks.updateStatus.path, { id: taskId }), {
        status, ...((expectedStatus ?? task?.status) ? { expectedStatus: expectedStatus ?? task.status } : {}),
      });
    },
    onSuccess: () => toast({ title: "Actividad actualizada", description: "Registro confirmado por el servidor." }),
    onError: (error: any) => toast({ title: "No se confirmó la acción", description: error?.status ? error.message : "Actualiza la agenda antes de reintentar.", variant: "destructive" }),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([planQueryKey(variables.planId), planTasksQueryKey(variables.planId), planLocksQueryKey(variables.planId), [`/api/plans/${variables.planId}/execution`]].map(queryKey => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

export function useResetTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ taskId }: { taskId: number; planId: number; effectiveTimeHHMM?: string }) => apiRequest("POST", buildUrl(api.dailyTasks.reset.path, { id: taskId }), {}),
    onSuccess: () => toast({ title: "Actividad restablecida", description: "El histórico se conserva." }),
    onError: (error: any) => toast({ title: "No se confirmó el restablecimiento", description: error?.status ? error.message : "Actualiza la agenda antes de reintentar.", variant: "destructive" }),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([planQueryKey(variables.planId), planTasksQueryKey(variables.planId), planLocksQueryKey(variables.planId), [`/api/plans/${variables.planId}/execution`]].map(queryKey => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

export function useLocks(planId: number) {
  return useQuery<Lock[]>({
    queryKey: planLocksQueryKey(planId),
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
    queryKey: contestantsQueryKey(planId),
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
    onMutate: async (input) => {
      const key = contestantsQueryKey(planId);
      await queryClient.cancelQueries({ queryKey: key });
      const previousContestants = queryClient.getQueryData(key);
      const optimisticId = -Date.now();

      queryClient.setQueryData(key, (old: any[] = []) => [
        ...old,
        {
          id: optimisticId,
          planId,
          createdAt: new Date().toISOString(),
          ...input,
        },
      ]);

      return { previousContestants };
    },
    onError: (_error, _input, ctx) => {
      if (ctx?.previousContestants) {
        queryClient.setQueryData(contestantsQueryKey(planId), ctx.previousContestants);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: contestantsQueryKey(planId) });
      queryClient.invalidateQueries({ queryKey: planQueryKey(planId) });
    },
  });
}


export function useDeleteContestant(planId: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (contestantId: number) =>
      apiRequest(
        "DELETE",
        buildUrl(api.plans.contestants.delete.path, {
          id: planId,
          contestantId,
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contestantsQueryKey(planId) });
      queryClient.invalidateQueries({ queryKey: planQueryKey(planId) });
      toast({ title: "Concursante eliminado" });
    },
    onError: (err: any) => {
      toast({
        title: "No se pudo eliminar",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
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
      queryClient.invalidateQueries({ queryKey: contestantsQueryKey(planId) });
      queryClient.invalidateQueries({ queryKey: planQueryKey(planId) });
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
