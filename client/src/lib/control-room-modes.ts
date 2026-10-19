import type { AppRole } from '../hooks/use-user-role';
import type { ExecutionContext } from '../../../shared/execution';

export type ControlRoomMode = 'production' | 'director' | 'technical';
export const modeLabels: Record<ControlRoomMode, string> = {
  production: 'Producción', director: 'Dirección', technical: 'Técnico',
};

/** Presentation policy only. The HTTP authorities still decide which data is readable. */
export function allowedControlRoomModes(role: AppRole | null, execution?: ExecutionContext | null): ControlRoomMode[] {
  // A disagreement can be a role change between independent HTTP confirmations.
  if (!role || execution && execution.role !== role) return [];
  if (role === 'aux') return ['production'];
  if (role === 'viewer') return ['director'];
  // hasScope describes an auxiliary assignment, not the global-read authority.
  const global = execution?.role === role;
  if (role === 'admin') return global ? ['production', 'director', 'technical'] : ['technical'];
  return global ? ['production', 'director'] : ['production'];
}

export function resolveControlRoomMode(saved: string | null | undefined, allowed: readonly ControlRoomMode[]): ControlRoomMode | null {
  return allowed.find(mode => mode === saved) ?? allowed[0] ?? null;
}

export const modeStorageKey = (actor: string) => `control-room:perspective:${actor}`;

export type QueryHealth = {
  dataUpdatedAt: number; isError: boolean; isFetching: boolean;
  error: unknown;
};
export function readHealth(query: QueryHealth, now: number, interval: number | false, online: boolean) {
  const ageSeconds = query.dataUpdatedAt > 0 ? Math.max(0, Math.floor((now - query.dataUpdatedAt) / 1000)) : null;
  const stale = ageSeconds !== null && ageSeconds * 1000 > (interval || 30000) + 20000;
  return { ageSeconds, stale, label: query.isError ? 'Error de consulta' : !online ? 'Sin reconfirmar · offline'
    : stale ? 'Dato obsoleto' : !query.dataUpdatedAt ? 'Sin confirmar' : query.isFetching ? 'Reconfirmando' : 'Lectura HTTP confirmada' };
}
