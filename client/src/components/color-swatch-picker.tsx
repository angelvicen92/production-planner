import { Input } from "@/components/ui/input";
import { useRef } from "react";

export function normalizeHexColor(input: string | undefined | null): string | null {
  const raw = String(input ?? "").trim();
  const shortHex = raw.match(/^#([\da-fA-F]{3})$/);
  if (shortHex) {
    return `#${shortHex[1]
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase()}`;
  }

  const fullHex = raw.match(/^#([\da-fA-F]{6})$/);
  if (fullHex) {
    return `#${fullHex[1].toUpperCase()}`;
  }

  return null;
}

function normalizeColor(value?: string | null, fallback = "#64748b") {
  return normalizeHexColor(value) ?? normalizeHexColor(fallback) ?? "#64748B";
}

export function ColorSwatchPicker({
  value,
  onChange,
  fallback = "#64748b",
  className,
}: {
  value?: string | null;
  onChange: (next: string) => void;
  fallback?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const safeColor = normalizeColor(value, fallback);

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <button
        type="button"
        className="h-8 w-8 rounded border"
        style={{ backgroundColor: safeColor }}
        onClick={() => inputRef.current?.click()}
        title="Seleccionar color"
      />
      <input
        ref={inputRef}
        type="color"
        value={safeColor}
        onChange={(e) => onChange(normalizeColor(e.currentTarget.value, fallback))}
        className="sr-only"
      />
      <Input
        className="h-8 w-28"
        value={normalizeHexColor(value) ?? safeColor}
        placeholder="#RRGGBB"
        onChange={(e) => onChange(normalizeHexColor(e.currentTarget.value) ?? safeColor)}
      />
    </div>
  );
}
