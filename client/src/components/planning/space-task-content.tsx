import React, { type ReactNode } from "react";

/** Content only: placement, hit target and editing remain owned by the timeline. */
export function SpaceTaskContent({ participants = [], activity, time, height, compact, icon, warning }: {
  participants?: readonly string[];
  activity: string;
  time: string;
  height: number;
  compact: boolean;
  icon?: ReactNode;
  warning?: boolean;
}) {
  const available = Math.max(0, height - (height < 32 ? 2 : compact ? 6 : 10));
  const lineHeight = Math.min(compact ? 12 : 15, available);
  const participant = participants.join(" + ");
  const primary = participant || activity;
  return <div className="min-w-0 overflow-hidden" title={[primary, participant ? activity : null, time].filter(Boolean).join(" · ")}>
    <div data-space-task-primary className="flex min-w-0 overflow-hidden font-bold" style={{ fontSize: Math.min(compact ? 10 : 12, lineHeight), lineHeight: `${lineHeight}px` }}>
      {participants.length > 1 ? participants.map((name, index) => <React.Fragment key={index}>
        {index ? <span className="shrink-0 whitespace-pre"> + </span> : null}
        <span data-space-task-participant className="min-w-0 flex-1 truncate" title={name}>{name}</span>
      </React.Fragment>) : <span className="truncate">{primary}</span>}
      {icon ? <span className="ml-1 shrink-0">{icon}</span> : null}{warning ? <span className="ml-1 shrink-0">⚠</span> : null}
    </div>
    {available >= lineHeight + 12 ? <div data-space-task-secondary className="flex min-w-0 gap-1 text-[10px] leading-3">
      {participant ? <span className="truncate">{activity}</span> : null}<span className="shrink-0 tabular-nums">{time}</span>
    </div> : null}
  </div>;
}
