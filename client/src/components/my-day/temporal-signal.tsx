import React from 'react';
import { CheckCircle2, Clock, Hourglass, Info, TimerOff } from 'lucide-react';
import { formatExecutionDuration } from '../../../../shared/execution';
import type { MyDayTemporal } from '../../lib/my-day-temporal';

const appearances = {
  normal: { style: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100', Icon: CheckCircle2, label: 'Dentro del horario previsto' },
  ending: { style: 'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100', Icon: Hourglass, label: 'Se acerca el fin previsto' },
  overrun: { style: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100', Icon: TimerOff, label: 'Fin previsto superado' },
  neutral: { style: 'border-border bg-muted/50 text-muted-foreground', Icon: Info, label: 'Comparación temporal no disponible' },
  completed: { style: 'border-border bg-muted/50 text-foreground', Icon: Clock, label: 'Desviación real frente al planning' },
};
const delta = (seconds: number, positive: string, negative: string) => seconds === 0 ? 'a la hora prevista' : `${formatExecutionDuration(Math.round(Math.abs(seconds)))} ${seconds > 0 ? positive : negative}`;

export function TemporalSignal({ signal }: { signal: MyDayTemporal | null }) {
  if (!signal) return null;
  const { style, Icon, label } = appearances[signal.kind];
  return <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${style}`} data-testid="temporal-signal" data-temporal-state={signal.kind}>
    <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <div className="min-w-0"><p className="font-semibold">{label}</p>
      {signal.kind === 'neutral' ? <p>{signal.reason}</p> : signal.kind === 'completed' ? <>
        <p>Inicio: {delta(signal.startDelta, 'después', 'antes')}.</p>
        <p>Fin: {delta(signal.endDelta, 'después', 'antes')}.</p>
        <p>Duración activa: {signal.durationDelta === 0 ? 'igual a la prevista' : delta(signal.durationDelta, 'más de lo previsto', 'menos de lo previsto')}.</p>
      </> : <p className="tabular-nums">{signal.kind === 'overrun' ? 'Exceso sobre el fin previsto' : 'Tiempo hasta el fin previsto'}: <span className="font-mono font-semibold">{formatExecutionDuration(signal.seconds)}</span>{signal.kind === 'ending' ? ' · tramo final del horario' : ''}</p>}
    </div>
  </div>;
}
