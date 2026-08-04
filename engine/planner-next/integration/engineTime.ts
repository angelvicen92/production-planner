import type { Minute } from "../contracts";

/** Planner Next uses minutes since 00:00 as its explicit temporal origin. */
export function engineTimeToMinute(value: string): Minute {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new RangeError(`Invalid HH:mm value: ${value}`);
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function minuteToEngineTime(value: Minute): string {
  if (!Number.isInteger(value) || value < 0 || value > 1439) throw new RangeError(`Invalid minute value: ${value}`);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
