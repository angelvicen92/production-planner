import type { Express } from 'express';
import { z } from 'zod';
import { api } from '../shared/routes';
import { executionError } from './liveExecution';
import { supabaseAdmin } from './supabase';

export function registerBulkExecutionResetRoutes(app: Express) {
  app.post(api.plans.resetExecution.path, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // Defense in depth: the API boundary and SQL also enforce ADMIN.
    if ((req as any).userRole !== 'admin') {
      return void res.status(403).json({ message: 'Solo ADMIN puede restablecer toda la ejecución.' });
    }
    try {
      const planId = z.coerce.number().int().positive().safe().parse(req.params.id);
      const input = api.plans.resetExecution.input.parse(req.body);
      const { data, error } = await supabaseAdmin.rpc('reset_plan_execution', {
        p_plan_id: planId, p_actor: (req as any).user.id, p_expected_tasks: input.expectedTasks,
      });
      if (error) throw error;
      const result = api.plans.resetExecution.response.safeParse(data);
      if (!result.success) throw new Error('EXECUTION_RESPONSE_MISSING');
      res.json(result.data);
    } catch (error) {
      if (error instanceof z.ZodError) return void res.status(400).json({ message: 'La jornada o sus versiones de ejecución no son válidas.' });
      const failure = executionError(error);
      res.status(failure.status).json({ message: failure.message });
    }
  });
}
