import { useMemo } from 'react';
import type { ExecutionContext } from '@shared/execution';
import type { Incident } from '@shared/incidents';
import { projectControlRoom, type LocationRead, type PlanRead } from '@/lib/control-room-metrics';
import type { ControlRoomSettings } from '@/hooks/use-control-room-settings';
import { ExecutiveSummary } from './control-room/executive-summary';
import { AttentionPanel } from './control-room/attention-panel';
import { StudioSituation } from './control-room/studio-situation';
import { UpcomingActivities } from './control-room/upcoming-activities';

export function ProductionControlPanel({ plan, zones, spaces, contestants, execution, incidents, operationalNowMs, realNowMs, settings, directorMode = false, planningRunning = false }: {
  plan: PlanRead; zones: LocationRead[]; spaces: LocationRead[]; contestants: { id: number; name: string }[];
  execution?: ExecutionContext | null; incidents?: Incident[] | null;
  operationalNowMs: number; realNowMs: number; settings?: ControlRoomSettings; directorMode?: boolean; planningRunning?: boolean;
}) {
  const metrics = useMemo(() => projectControlRoom({ plan, zones, spaces, contestants, execution, incidents, nowMs: operationalNowMs,
    planningRunning, nextSoonMinutes: settings?.nextSoonThresholdMin, delayThresholdMinutes: settings?.delayThresholdMin, enableDelayAlert: settings?.enableDelayAlert,
  }), [plan, zones, spaces, contestants, execution, incidents, operationalNowMs, planningRunning, settings]);
  return <div className="space-y-5" data-testid="control-room-pro">
    <ExecutiveSummary metrics={metrics} plan={plan} director={directorMode} />
    <AttentionPanel metrics={metrics} planId={plan.id} realNow={realNowMs} director={directorMode} />
    <StudioSituation metrics={metrics} planId={plan.id} director={directorMode} />
    <UpcomingActivities metrics={metrics} director={directorMode} />
  </div>;
}
