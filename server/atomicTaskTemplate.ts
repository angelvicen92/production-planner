import type { Express } from 'express';
import { z } from 'zod';
import { api } from '../shared/routes';
import { mapTaskTemplatePatch, mapTaskTemplateRow } from './taskTemplateMapping';

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;

export function registerAtomicTaskTemplateRoutes(app: Express, rpc: Rpc) {
  app.post(api.taskTemplates.updateWithInverse.path, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!(req as any).user?.id) return void res.status(401).json({ message: 'Unauthorized' });
    if ((req as any).userRole !== 'admin') return void res.status(403).json({ message: 'Solo ADMIN puede editar el catálogo.' });
    try {
      const id = z.coerce.number().int().positive().max(2147483647).parse(req.params.id);
      const input = api.taskTemplates.updateWithInverse.input.parse(req.body);
      const affected = [id, ...input.addedInverseIds, ...input.removedInverseIds];
      if (new Set(affected).size !== affected.length || input.expectedTemplates.length !== affected.length ||
        input.expectedTemplates.some(row => !affected.includes(row.id))) {
        return void res.status(400).json({ message: 'Las versiones deben corresponder a todas las plantillas afectadas, sin duplicados ni autodependencias.' });
      }
      const { data, error } = await rpc('save_task_template_with_inverse', {
        p_template_id: id, p_actor: (req as any).user.id,
        p_patch: mapTaskTemplatePatch(input.patch), p_expected: input.expectedTemplates,
        p_added: input.addedInverseIds, p_removed: input.removedInverseIds,
      });
      if (error) throw error;
      res.json(mapTaskTemplateRow(data));
    } catch (error: any) {
      if (error instanceof z.ZodError) return void res.status(400).json({ message: error.errors[0].message });
      const message = String(error?.message ?? '');
      if (message.includes('TEMPLATE_CONFLICT')) return void res.status(409).json({ message: 'Otra sesión ha cambiado una plantilla afectada. No se ha guardado ningún cambio. Pulsa Recargar para revisar los datos actuales.' });
      if (message.includes('TEMPLATE_FORBIDDEN')) return void res.status(403).json({ message: 'Solo ADMIN puede editar el catálogo.' });
      if (message.includes('TEMPLATE_INVALID')) return void res.status(400).json({ message: 'IDs o dependencias no válidos: revisa inexistentes, duplicados y autodependencias.' });
      res.status(500).json({ message: 'No se pudo guardar la plantilla y sus dependencias. No se ha guardado ningún cambio.' });
    }
  });
}
