import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { api } from '../shared/routes';
import { supabaseAdmin } from './supabase';
import { executionError } from './liveExecution';

// Authentication and the role/task precheck are installed by routes.ts.
// SQL revalidates G0 under the same locks used by Start/Finish.
export function registerExecutionTimeRoutes(app: Express) {
  const handler = (read: boolean): RequestHandler => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const taskId = z.coerce.number().int().positive().safe().parse(req.params.id);
      const actor = (req as any).user.id;
      const input = read ? null : api.dailyTasks.correctTime.input.parse(req.body);
      const { data, error } = input
        ? await supabaseAdmin.rpc('correct_task_execution_time', {
          p_task_id: taskId, p_actor: actor, p_field: input.field, p_real_at: input.realAt,
          p_reason: input.reason, p_expected_version: input.expectedVersion,
        })
        : await supabaseAdmin.rpc('task_execution_history', { p_task_id: taskId, p_actor: actor });
      if (error) throw error;
      if (!data) throw new Error('EXECUTION_RESPONSE_MISSING');
      // Same task authority and field names as the existing task read endpoints.
      res.json(read ? data : Object.fromEntries(Object.entries(data).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value,
      ])));
    } catch (error) {
      if (error instanceof z.ZodError) return void res.status(400).json({ message: error.errors[0].message });
      const failure = executionError(error);
      res.status(failure.status).json({ message: failure.message });
    }
  };
  app.patch(api.dailyTasks.correctTime.path, handler(false));
  app.get(api.dailyTasks.executionHistory.path, handler(true));
}
