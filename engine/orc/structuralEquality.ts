const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = normalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
};

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function structuralEquals(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}
