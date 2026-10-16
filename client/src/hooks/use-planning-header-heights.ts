import { useLayoutEffect, useState, type RefObject } from "react";

/** Measure natural content, then align every timeline to one common time origin. */
export function usePlanningHeaderHeights(viewport: RefObject<HTMLDivElement>, revision: unknown) {
  const [heights, setHeights] = useState({ zone: 76, space: 76, tall: false });
  useLayoutEffect(() => {
    const root = viewport.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      const max = (selector: string) => Math.max(36, ...Array.from(root.querySelectorAll<HTMLElement>(selector)).map(content => {
        const style = getComputedStyle(content.parentElement!);
        return Math.ceil(content.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2);
      }));
      const zone = max(".planning-zone-heading > .planning-heading-content"), space = max(".planning-space-heading > .planning-heading-content");
      const next = { zone, space, tall: zone + space > Math.max(240, root.clientHeight * 0.6) };
      setHeights(old => old.zone === next.zone && old.space === next.space && old.tall === next.tall ? old : next);
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); });
    observer.observe(root);
    root.querySelectorAll(".planning-heading-content").forEach(element => observer.observe(element));
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [viewport, revision]);
  return heights;
}
