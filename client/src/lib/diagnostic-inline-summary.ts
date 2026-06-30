const MAX_INLINE_DIAGNOSTIC_LENGTH = 220;

function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Desconocido";
  return value.trim().replaceAll("_", " ");
}

export function summarizeInlineDiagnosticValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value !== "object") return label(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  const entries = Object.entries(value as Record<string, unknown>);
  const primitiveSummary = entries
    .filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item))
    .slice(0, 5)
    .map(([key, item]) => `${key}:${String(item)}`)
    .join(" · ");
  const summary = primitiveSummary || `Objeto con ${entries.length} campos`;
  return summary.length > MAX_INLINE_DIAGNOSTIC_LENGTH ? `${summary.slice(0, MAX_INLINE_DIAGNOSTIC_LENGTH - 1)}…` : summary;
}
