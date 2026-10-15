import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useDaySection } from "@/hooks/use-day-section";
import type { DaySection } from "@/lib/day-section-preferences";

/** A component boundary lets dynamic groups reuse the hook without calling it in loops. */
export function PersistedDaySection({ planId, section, anchorIds, ...props }: {
  planId: number;
  section: DaySection;
  anchorIds?: string[];
} & Omit<Parameters<typeof DayCollapsibleSection>[0], "open" | "onOpenChange">) {
  const [open, setOpen] = useDaySection(planId, section);
  const anchors = anchorIds?.join("|");
  useEffect(() => {
    if (!anchors) return;
    const reveal = (id: string) => {
      if (!anchors.split("|").includes(id)) return;
      setOpen(true);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "nearest" }));
    };
    const hashChange = () => reveal(window.location.hash.slice(1));
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#"]') : null;
      if (link && !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) reveal(link.hash.slice(1));
    };
    hashChange();
    window.addEventListener("hashchange", hashChange);
    // Clicking the same anchor again does not emit hashchange after manual closure.
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("hashchange", hashChange);
      document.removeEventListener("click", click);
    };
  }, [anchors, setOpen]);
  return <DayCollapsibleSection {...props} open={open} onOpenChange={setOpen} testId={props.testId ?? `section-${section}`} />;
}

/** Actions are siblings of the native trigger: no nested buttons or event suppression.
 * Keep content mounted so closing a section preserves forms and local editing state. */
export function DayCollapsibleSection({ title, open, onOpenChange, actions, children, className, testId }: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const contentId = useId();
  const [visited, setVisited] = useState(open);
  useEffect(() => { if (open) setVisited(true); }, [open]);
  return <Collapsible open={open} onOpenChange={onOpenChange} className={cn("rounded-lg border bg-card", className)} data-testid={testId}>
    <div className="flex flex-wrap items-center gap-2 pr-3">
      <h3 className="min-w-0 flex-1">
        <CollapsibleTrigger aria-controls={contentId} data-day-section-trigger className="flex w-full items-center justify-between gap-3 rounded-md p-3 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span>{title}</span>
          <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
      </h3>
      {actions ? <div className="flex flex-wrap items-center gap-2 pr-3">{actions}</div> : null}
    </div>
    <CollapsibleContent id={contentId} forceMount hidden={!open} className="px-3 pb-3">
      {open || visited ? children : null}
    </CollapsibleContent>
  </Collapsible>;
}
