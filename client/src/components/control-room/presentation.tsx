import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatExecutionDuration } from '@shared/execution';
export function signedDuration(seconds: number | null): string {
  return seconds === null || !Number.isFinite(seconds) ? 'No calculable' : `${seconds > 0 ? '+' : seconds < 0 ? '−' : ''}${formatExecutionDuration(Math.floor(Math.abs(seconds)))}`;
}
const clockFormatters = [false, true].map(seconds => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false }));
export function clockTime(at: number | null, seconds = false): string {
  return at === null || !Number.isFinite(at) ? 'No disponible' : clockFormatters[Number(seconds)].format(at);
}
export function datedTime(at: number | null): string {
  return at === null || !Number.isFinite(at) ? 'Sin confirmar' : new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'medium' }).format(at);
}
export function incidentAge(created: string, realNow: number): string {
  const at = Date.parse(created);
  if (!Number.isFinite(at) || at > realNow) return 'Apertura por confirmar';
  const seconds = Math.floor((realNow - at) / 1000);
  return seconds < 60 ? 'Abierta hace menos de 1 min' : seconds < 3600 ? `Abierta hace ${Math.floor(seconds / 60)} min` : `Abierta hace ${Math.floor(seconds / 3600)} h ${Math.floor(seconds % 3600 / 60)} min`;
}
export function Surface({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={cn('min-w-0 rounded-2xl border bg-card p-5 shadow-sm sm:p-6', className)}>{children}</section>;
}
