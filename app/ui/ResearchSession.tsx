"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

type Records = Record<string, unknown>;
type Update = <T,>(key: string, action: SetStateAction<T>, fallback: T) => void;
const Context = createContext<{ records: Records; update: Update } | null>(null);

/** Ephemeral state shared by routes. No personal input is written to browser storage. */
export function ResearchSession({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<Records>({});
  const update: Update = useCallback((key, action, fallback) => {
    setRecords((previous) => {
      const value = Object.hasOwn(previous, key) ? previous[key] : fallback;
      return { ...previous, [key]: typeof action === "function" ? (action as (current: typeof fallback) => typeof fallback)(value as typeof fallback) : action };
    });
  }, []);
  useEffect(() => {
    // Remove the previous version's persisted guide; never read personal answers from it.
    try { window.sessionStorage.removeItem("oz-guided-check-v1"); } catch { /* Storage may be disabled. */ }
    const clear = () => setRecords({});
    window.addEventListener("research-clear", clear);
    return () => window.removeEventListener("research-clear", clear);
  }, []);
  const value = useMemo(() => ({ records, update }), [records, update]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useResearchState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(Context);
  if (!context) throw new Error("ResearchSession is required");
  const [fallback] = useState(initial);
  const { records, update } = context;
  const set = useCallback((action: SetStateAction<T>) => update(key, action, fallback), [key, update, fallback]);
  return [Object.hasOwn(records, key) ? records[key] as T : fallback, set];
}
