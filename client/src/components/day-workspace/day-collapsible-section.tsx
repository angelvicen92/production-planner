import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

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
  const [visited, setVisited] = useState(open);
  useEffect(() => { if (open) setVisited(true); }, [open]);
  return <Collapsible open={open} onOpenChange={onOpenChange} className={cn("rounded-lg border bg-card", className)} data-testid={testId}>
    <div className="flex flex-wrap items-center gap-2 pr-3">
      <h3 className="min-w-0 flex-1">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-md p-3 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span>{title}</span>
          <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
      </h3>
      {actions ? <div className="flex flex-wrap items-center gap-2 pr-3">{actions}</div> : null}
    </div>
    <CollapsibleContent forceMount hidden={!open} className="px-3 pb-3">
      {open || visited ? children : null}
    </CollapsibleContent>
  </Collapsible>;
}
