import type { ReactNode } from "react";
import { DayCollapsibleSection } from "@/components/day-workspace/day-collapsible-section";
import { useSettingsSection } from "@/hooks/use-settings-section";
import type { SettingsSection as Section } from "@/lib/settings-section-preferences";

/** Only folding retains mounted content; inactive tabs keep their existing lifecycle. */
export function SettingsSection({ section, title, actions, busy, error, children }: {
  section: Section;
  title: string;
  actions?: ReactNode;
  busy?: boolean;
  error?: unknown;
  children: ReactNode;
}) {
  const [open, setOpen] = useSettingsSection(section);
  return <div data-settings-section onBlurCapture={(event) => {
    // Focusing a settings section's native trigger must not invoke a child's onBlur
    // writer. Its controlled draft stays mounted and can be saved after reopening.
    // Other focus changes keep the existing save-on-blur behavior.
    const target = event.relatedTarget;
    if (target instanceof HTMLElement && target === target.closest("[data-settings-section]")?.querySelector("h3 > button[aria-controls]")) {
      event.stopPropagation();
    }
  }}>
    <DayCollapsibleSection title={title} open={open} onOpenChange={setOpen}
      testId={`settings-section-${section}`} actions={<>
        {busy ? <span role="status" className="text-xs text-muted-foreground">Guardando…</span> : null}
        {error ? <span role="alert" className="text-xs text-destructive">Hay errores en este apartado. Ábrelo para revisarlos.</span> : null}
        {actions}
      </>}>
      {children}
    </DayCollapsibleSection>
  </div>;
}
