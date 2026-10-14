import { z } from 'zod';

export function incidentError(error: unknown): { status: number; message: string } {
  if (error instanceof z.ZodError) return { status: 400, message: 'Revisa los campos de la incidencia.' };
  const { message = '', code = '' } = (error ?? {}) as { message?: string; code?: string };
  if (message.includes('INCIDENT_FORBIDDEN')) return { status: 403, message: 'No tienes autoridad sobre esta incidencia. Aux requiere una tarea de su ámbito nominal.' };
  if (message.includes('INCIDENT_NOT_FOUND')) return { status: 404, message: 'La jornada o la incidencia no está disponible.' };
  if (message.includes('INCIDENT_REQUEST_CONFLICT')) return { status: 409, message: 'Este borrador ya se guardó con otros datos. Revisa el registro antes de registrar otra incidencia.' };
  if (/INCIDENT_(STALE|TRANSITION)/.test(message)) return { status: 409, message: 'La incidencia cambió en otra sesión. Actualiza el detalle y revisa los cambios antes de continuar.' };
  if (/INCIDENT_INVALID/.test(message) || ['23503', '23514', '23502', '22P02'].includes(code)) return { status: 400, message: 'Revisa los datos: tarea, persona, lugar y recurso deben corresponder a esta jornada y entre sí.' };
  return { status: 503, message: 'Guardado no confirmado. Actualiza la lista antes de reintentar; tu borrador se conserva.' };
}
