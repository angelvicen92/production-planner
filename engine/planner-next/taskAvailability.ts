import type { Task, Window } from "./contracts";

export function validateTaskAvailability(task: Task, day: Window): boolean {
  if (task.availability === undefined) return true;
  if (!Array.isArray(task.availability)) return false;
  return task.availability.every((window) => window !== null
    && Number.isInteger(window?.start) && Number.isInteger(window?.end)
    && window.start < window.end && window.start >= day.start && window.end <= day.end);
}

export function canonicalTaskAvailability(task: Task, day: Window): Window[] | undefined {
  if (task.availability === undefined) return undefined;
  if (!validateTaskAvailability(task, day)) return [];
  return task.availability.map(({ start, end }) => ({ start, end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

export function taskFitsAvailability(task: Task, start: number, end: number): boolean {
  return task.availability === undefined
    || task.availability.some((window) => window.start <= start && end <= window.end);
}
