"use client";

import { useEffect } from "react";

/** Keep focused controls and fragment destinations below the wrapping sticky notice. */
export default function AccessibilitySupport() {
  useEffect(() => {
    const notice = document.querySelector(".disclaimer");
    if (!notice) return;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty("--notice-offset", `${notice.getBoundingClientRect().height}px`));
    observer.observe(notice);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--notice-offset"); };
  }, []);
  return null;
}
