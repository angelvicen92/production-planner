import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
export function clockTime(at: number | null, seconds = false): string {
  return at === null || !Number.isFinite(at) ? 'No disponible' : new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false }).format(at);
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
