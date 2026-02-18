import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { DailyTask, Lock, TaskTemplate, InsertDailyTask, InsertTaskTemplate } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { api, buildUrl } from "@shared/routes";
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
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: planQueryKey(variables.planId) });
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
    mutationFn: ({ taskId, status }: {
      taskId: number;
      planId: number;
      status: "pending" | "in_progress" | "done" | "interrupted" | "cancelled";
    }) =>
      apiRequest(
        "PATCH",
        buildUrl(api.dailyTasks.updateStatus.path, { id: taskId }),
        { status },
      ),
    onMutate: async ({ planId, taskId, status }) => {
      const key = planQueryKey(planId);
      await queryClient.cancelQueries({ queryKey: key });
      const previousPlan = queryClient.getQueryData(key);

      queryClient.setQueryData(key, (old: any) => {
        if (!old) return old;
        const nextDailyTasks = Array.isArray(old.dailyTasks)
          ? old.dailyTasks.map((task: any) =>
              Number(task?.id) === taskId ? { ...task, status } : task,
            )
          : old.dailyTasks;
        return { ...old, dailyTasks: nextDailyTasks };
      });

      return { previousPlan, planId };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.previousPlan) {
        queryClient.setQueryData(planQueryKey(ctx.planId), ctx.previousPlan);
      }
      toast({
        title: "No se pudo actualizar la tarea",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
    onSettled: (data: any, _error, vars) => {
      const planId = Number(data?.planId ?? data?.plan_id ?? vars.planId ?? 0);
      if (planId) {
        queryClient.invalidateQueries({ queryKey: planQueryKey(planId) });
      }
      toast({
        title: "Task Updated",
        description: `Status changed to ${data?.status ?? vars.status}`,
      });
    },
  });
}

export function useResetTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ taskId }: { taskId: number; planId: number }) =>
      apiRequest("POST", buildUrl(api.dailyTasks.reset.path, { id: taskId })),
    onMutate: async ({ planId, taskId }) => {
      const key = planQueryKey(planId);
      await queryClient.cancelQueries({ queryKey: key });
      const previousPlan = queryClient.getQueryData(key);

      queryClient.setQueryData(key, (old: any) => {
        if (!old) return old;
        const nextDailyTasks = Array.isArray(old.dailyTasks)
          ? old.dailyTasks.map((task: any) =>
              Number(task?.id) === taskId
                ? { ...task, status: "pending", startReal: null, endReal: null }
                : task,
            )
          : old.dailyTasks;
        return { ...old, dailyTasks: nextDailyTasks };
      });

      return { previousPlan, planId };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.previousPlan) {
        queryClient.setQueryData(planQueryKey(ctx.planId), ctx.previousPlan);
      }
      toast({
        title: "No se pudo resetear la tarea",
        description: err?.message || "Error desconocido",
        variant: "destructive",
      });
    },
    onSettled: (data: any, _error, vars) => {
      const planId = Number(data?.planId ?? data?.plan_id ?? vars.planId ?? 0);
      if (planId) {
        queryClient.invalidateQueries({ queryKey: planQueryKey(planId) });
      }
      toast({ title: "Tarea reseteada", description: "La tarea volvió a pendiente." });
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
