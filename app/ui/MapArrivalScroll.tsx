"use client";

import { useEffect } from "react";

/** Reset both the document and the independently scrolling desktop columns.
 * Run after navigation commits; ordinary map/filter changes keep their position.
 */
export default function MapArrivalScroll() {
  useEffect(() => {
    let frame = 0;
    const reset = () => {
      for (const pane of document.querySelectorAll<HTMLElement>(".explorer-filters, .explorer-results")) {
        pane.scrollTop = 0;
        pane.scrollLeft = 0;
      }
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      // Allow Next's scroll restoration and the destination layout to finish first.
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(reset); });
    };
    const onLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === "/map") schedule();
    };
    schedule();
    // Also cover links to this page while the explorer is already mounted.
    document.addEventListener("click", onLink);
    window.addEventListener("pageshow", schedule);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", onLink);
      window.removeEventListener("pageshow", schedule);
    };
  }, []);
  return null;
}
