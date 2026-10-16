import { createContext, useEffect, useRef } from "react";

/** A workspace owns the single active panel; legacy standalone panels still work. */
export const PlanningFullscreenContext = createContext<{
  activePanel: string | null;
  setActivePanel: (key: string | null) => void;
} | null>(null);

export function usePlanningFullscreen(active: boolean, onEscape: () => void) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    const previousMarker = document.body.dataset.planningFullscreen;
    const { scrollX, scrollY } = window;
    document.body.style.overflow = "hidden";
    document.body.dataset.planningFullscreen = "true";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"]')) return;
      event.preventDefault();
      escapeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousMarker === undefined) delete document.body.dataset.planningFullscreen;
      else document.body.dataset.planningFullscreen = previousMarker;
      window.scrollTo(scrollX, scrollY);
    };
  }, [active]);
}
