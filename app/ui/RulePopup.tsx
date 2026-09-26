"use client";

/**
 * A pop-up that shows rules and their exact quoted sources in place, so
 * reading more never navigates away from what someone is doing (the guided
 * check in particular). Provided once in the root layout; Cite opens it.
 */

import { createContext, useContext, useRef, useState } from "react";
import { citeLabel, legalSource, RULES, type RuleId } from "@/lib/content/rules";

type Open = (rules: readonly RuleId[]) => void;
const RulePopupContext = createContext<Open | null>(null);

export function useRulePopup(): Open | null {
  return useContext(RulePopupContext);
}

export function RulePopupProvider({ children }: { children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rules, setRules] = useState<readonly RuleId[]>([]);

  const open: Open = (ids) => {
    setRules(ids);
    dialog.current?.showModal();
  };

  return (
    <RulePopupContext.Provider value={open}>
      {children}
      <dialog
        ref={dialog}
        className="rule-popup"
        aria-labelledby="rule-popup-title"
        onClick={(e) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="rule-popup-body">
          <div className="rule-popup-head">
            <strong id="rule-popup-title">The rule and its sources</strong>
            <button type="button" className="mcp-close" onClick={() => dialog.current?.close()} aria-label="Close">
              ×
            </button>
          </div>
          {rules.map((id) => {
            const r = RULES[id];
            return (
              <section key={id} className="rule-popup-rule">
                <h3>{r.title}</h3>
                <p>{r.text}</p>
                <ul className="quotes">
                  {r.cites.map((c) => (
                    <li key={`${c.source}|${c.pin}|${c.quote.slice(0, 24)}`}>
                      <a href={legalSource(c.source).url} target="_blank" rel="noopener noreferrer">
                        {citeLabel(c)} <span className="new-tab">(opens in a new tab)</span>
                      </a>
                      <blockquote>{c.quote}</blockquote>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="note">
            Quoted word for word from the official source. Every rule is on the{" "}
            <a href="/rules" target="_blank" rel="noopener">
              Rules and sources page
            </a>
            . Informational only, not investment, tax or legal advice.
          </p>
        </div>
      </dialog>
    </RulePopupContext.Provider>
  );
}
