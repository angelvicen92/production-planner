import { api, buildUrl } from "@shared/routes";

export const planQueryKey = (planId: number) => [buildUrl(api.plans.get.path, { id: planId })] as const;

export const contestantsQueryKey = (planId: number) => ["contestants", planId] as const;

export const planTasksQueryKey = (planId: number) => [`/api/plans/${planId}/tasks`] as const;

export const planLocksQueryKey = (planId: number) => [`/api/plans/${planId}/locks`] as const;
