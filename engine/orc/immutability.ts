export function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || value === undefined) return value as Readonly<T>;
  if (typeof value !== "object" && typeof value !== "function") return value as Readonly<T>;

  const objectValue = value as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(objectValue)) {
    const nested = objectValue[key];
    if ((nested !== null && typeof nested === "object") || typeof nested === "function") {
      deepFreeze(nested);
    }
  }
  return Object.freeze(value) as Readonly<T>;
}
