export interface SpacePresentationTask {
  id: number;
  templateId: number;
  contestantId: number | null;
  isManualBlock?: boolean;
  breakKind?: string;
  template?: { uiColor?: string | null; uiColorSecondary?: string | null };
}

export interface SpaceTaskOperation { taskId: number; jointGroupId?: string | null }

/** Only explicit joint membership expands a card's participant label. */
export function spaceParticipantNames(
  tasks: readonly SpacePresentationTask[],
  names: Readonly<Record<number, string>>,
  operations: readonly SpaceTaskOperation[] = [],
): ReadonlyMap<number, readonly string[]> {
  const groups = new Map(operations.filter(op => op.jointGroupId).map(op => [Number(op.taskId), op.jointGroupId!]));
  const members = new Map<string, Set<number>>();
  for (const task of tasks) {
    const group = groups.get(Number(task.id));
    if (!group || task.isManualBlock || task.contestantId == null) continue;
    if (!members.has(group)) members.set(group, new Set());
    members.get(group)!.add(Number(task.contestantId));
  }
  return new Map(tasks.map(task => {
    const group = groups.get(Number(task.id));
    const ids = task.isManualBlock ? [] : group ? [...(members.get(group) ?? [])] : task.contestantId == null ? [] : [Number(task.contestantId)];
    return [Number(task.id), ids.map(id => names[id]?.trim()).filter((name): name is string => Boolean(name && name !== "—"))];
  }));
}

function normalizedColor(value?: string | null): string | undefined {
  const hex = value?.trim().replace(/^#/, "");
  if (!hex || !/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex)) return undefined;
  return `#${hex.length === 3 ? [...hex].map(char => char + char).join("") : hex}`;
}

/** Zone configuration owns identity; existing task palette is the closest fallback. */
export function spaceHeadingColor(zoneColor: string | null | undefined, tasks: readonly SpacePresentationTask[]): string | undefined {
  const configured = normalizedColor(zoneColor);
  if (configured) return configured;
  for (const task of [...tasks].filter(task => !task.isManualBlock && !task.breakKind).sort((a, b) => a.templateId - b.templateId || a.id - b.id)) {
    const color = normalizedColor(task.template?.uiColorSecondary) ?? normalizedColor(task.template?.uiColor);
    if (color) return color;
  }
  return undefined;
}

/** Choose the higher WCAG contrast against the actual opaque background. */
export function spaceForeground(color?: string): string | undefined {
  const hex = normalizedColor(color);
  if (!hex) return undefined;
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}
