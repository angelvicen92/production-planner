import type { ControlRoomProjection } from '@/lib/control-room-metrics';
import { readHealth, type QueryHealth } from '@/lib/control-room-modes';
import { Surface, datedTime } from './presentation';

export function DataHealth({ reads, now, interval, online, connected, failed, confirmedAt, metrics }: {
  reads: { name: string; query: QueryHealth }[]; now: number; interval: number | false;
  online: boolean; connected: boolean; failed: boolean; confirmedAt: number | null; metrics: ControlRoomProjection | null;
}) {
  return <div className="space-y-5" data-testid="control-room-technical">
    <Surface label="Salud de los datos"><h2 className="text-2xl font-bold">Salud de los datos</h2><p className="mt-2 text-sm text-foreground/75">Fiabilidad de las lecturas de OptiPlan. Cada consulta se evalúa por separado; una respuesta correcta no certifica la salud del servicio.</p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Conexión del navegador', online ? 'Online' : 'Sin conexión'],
        ['Canal realtime', !online ? 'Desconectado · offline' : connected ? 'Canal conectado; entrega no garantizada' : failed ? 'Canal fallido' : 'Canal sin confirmar'],
        ['Reconciliación HTTP', interval ? `Cada ${interval / 1000} s` : 'Pausada sin conexión'],
        ['Última confirmación conjunta HTTP', datedTime(confirmedAt)],
      ].map(([name, value]) => <div key={name} className="min-w-0 rounded-xl border bg-muted/30 p-4"><dt className="text-sm text-foreground/75">{name}</dt><dd className="mt-2 break-words font-semibold">{value}</dd></div>)}</dl>
      <p className="mt-4 text-sm text-foreground/75">La confirmación conjunta corresponde al mínimo de planificación, ejecución e incidencias. Conserva la fecha del último éxito aunque un intento posterior falle. No es un snapshot transaccional ni una garantía de entrega realtime.</p>
    </Surface>
    <Surface label="Estado de las consultas"><h2 className="text-xl font-semibold">Estado de las consultas</h2><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{reads.map(({ name, query }) => {
      const health = readHealth(query, now, interval, online);
      return <article key={name} className={`min-w-0 rounded-xl border p-4 ${query.isError || health.stale ? 'border-destructive/50' : ''}`}><h3 className="font-semibold">{name}</h3><p className="mt-2 font-medium">{health.label}</p><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-foreground/75">Último éxito HTTP · Europe/Madrid</dt><dd>{datedTime(query.dataUpdatedAt || null)}</dd></div><div><dt className="text-foreground/75">Antigüedad del dato</dt><dd>{health.ageSeconds === null ? 'Sin confirmar' : `${health.ageSeconds} s`}</dd></div></dl>{query.isError && <p role="alert" className="mt-3 break-words text-sm text-destructive">{query.error instanceof Error ? query.error.message : 'No se pudo confirmar la consulta.'}</p>}</article>;
    })}</div></Surface>
    <Surface label="Autoridad y métricas neutralizadas"><h2 className="text-xl font-semibold">Autoridad y métricas neutralizadas</h2><ul className="mt-4 space-y-3 text-sm">
      <li>Comparabilidad del reloj y la jornada: <strong>{!metrics ? 'Sin confirmar' : metrics.temporalApplicable ? 'Fecha comparable · Europe/Madrid' : 'Fecha distinta o reloj sin confirmar'}</strong>. {!metrics?.temporalApplicable && 'Retrasos actuales neutralizados.'}</li>
      <li>Reloj operativo: {metrics?.clock ? metrics.clock.mode === 'manual' ? 'Simulado autorizado' : 'Real del servidor' : 'Sin autoridad confirmada'} · {datedTime(metrics?.operationalNow ?? null)}.</li>
      <li>{!metrics ? 'Contadores, progreso y estado del día neutralizados: falta planificación o contexto de ejecución coherente con el rol autenticado.' : metrics.scoped ? 'Lectura parcial: no acredita la totalidad ni la finalización global del día.' : 'Proyección limitada a las obligaciones recibidas de las APIs autorizadas.'}</li>
      <li>{metrics?.acceptedCoverage == null ? 'Cobertura aceptada y comienzo/fin definitivos sin autoridad confirmada.' : `Cobertura aceptada confirmada: ${metrics.acceptedCoverage} / ${metrics.total}.`} {metrics?.plannedEnd == null && 'Fin planificado no disponible: falta aceptación o cobertura completa.'}</li>
      <li>{metrics?.incidents.available ? 'Registro de incidencias confirmado por HTTP; su antigüedad y errores se muestran arriba.' : 'Contadores de incidencias y bloqueos neutralizados: consulta sin confirmar; desconocido no equivale a cero.'}</li>
      <li>Desviaciones individuales sólo con timestamps completos, planning aceptado y modo/revisión de reloj compatibles. Datos ausentes se presentan como «No calculable».</li>
      <li>Predicción de cierre: <strong>No disponible</strong>. Sin modelo validado de dependencias y recursos; no se calcula ETA, saturación ni criticidad causal.</li>
    </ul></Surface>
  </div>;
}
