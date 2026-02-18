import { Input } from "@/components/ui/input";
import { useRef } from "react";

function normalizeColor(value?: string | null, fallback = "#64748b") {
  const v = String(value ?? "").trim();
  return /^#([0-9a-fA-F]{6})$/.test(v) ? v : fallback;
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
        value={value ?? ""}
        placeholder="#RRGGBB"
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    </div>
  );
}
