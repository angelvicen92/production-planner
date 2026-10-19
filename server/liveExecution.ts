import { supabaseAdmin } from './supabase';

export async function canExecuteTask(taskId: number, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('execution_task_authorized', { p_task_id: taskId, p_actor: userId });
  if (error) throw error;
  return data === true;
}

export async function executionContext(planId: number, userId: string) {
  const { data, error } = await supabaseAdmin.rpc('execution_context', { p_plan_id: planId, p_actor: userId });
  if (error) throw error;
  return data;
}

export async function executeTask(taskId: number, userId: string, status: string, expectedStatus?: string, expectedVersion?: number) {
  const { data, error } = await supabaseAdmin.rpc('execute_task_transition', {
    p_task_id: taskId, p_actor: userId, p_status: status, p_expected_version: expectedVersion,
    p_expected_status: expectedStatus ?? (status === 'in_progress' || status === 'cancelled' ? 'pending' : 'in_progress'),
  });
  if (error) throw error;
  return data;
}

export function executionError(error: any): { status: number; message: string } {
  const code = String(error?.message ?? '');
  if (code.includes('EXECUTION_FORBIDDEN')) return { status: 403, message: 'No tienes autoridad operativa sobre esta actividad.' };
  if (code.includes('EXECUTION_NOT_FOUND')) return { status: 404, message: 'La actividad ya no está disponible.' };
  if (code.includes('EXECUTION_INVALID')) return { status: 400, message: 'Indica una hora con fecha y zona horaria y un motivo de 1 a 240 caracteres.' };
  if (code.includes('EXECUTION_CLOCK_INVALID')) return { status: 409, message: 'El reloj manual no determina una hora válida y unívoca en Madrid. Producción debe revisarlo.' };
  if (code.includes('EXECUTION_START_WORKDAY')) return { status: 409, message: 'La hora operativa no corresponde a la jornada del planning.' };
  if (/EXECUTION_(CHRONOLOGY|WORKDAY|STALE|TRANSITION|OCCUPIED|CLOCK_CHANGED|CLOCK_REVERSED|PLANNING_REQUIRED|LOCK_CONFLICT)/.test(code)) {
    const messages: Record<string, string> = {
      CHRONOLOGY: 'La hora no es compatible con el inicio, fin, pausas o reloj operativo.',
      WORKDAY: 'La hora debe pertenecer a la fecha de Madrid del planning.',
      STALE: 'La actividad cambió en otra sesión. Actualiza la agenda antes de continuar.',
      TRANSITION: 'Esta acción no corresponde al estado actual de la actividad.',
      OCCUPIED: 'La persona o el espacio ya tiene otra actividad en curso.',
      CLOCK_CHANGED: 'El reloj operativo cambió durante la actividad. Producción debe revisar el registro.',
      CLOCK_REVERSED: 'El reloj operativo es anterior al último registro. Producción debe revisarlo.',
      PLANNING_REQUIRED: 'Producción debe aceptar el planning completo antes de iniciar actividades.',
      LOCK_CONFLICT: 'Hay varias protecciones de ejecución antiguas. Producción debe revisar la actividad.',
    };
    const key = Object.keys(messages).find(key => code.includes(`EXECUTION_${key}`))!;
    return { status: 409, message: messages[key] };
  }
  return { status: 503, message: 'No se pudo guardar la actividad. No se ha confirmado ningún cambio; actualiza la agenda antes de reintentar.' };
}
