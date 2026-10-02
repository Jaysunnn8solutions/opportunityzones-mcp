"use client";
import Link from "next/link";
import { useState } from "react";
import { chatHandoff } from "@/lib/research/handoff";
import type { Specification } from "@/lib/research/workbench";
export default function ChatHandoff({ spec }: { spec: Specification }) {
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  const [message, setMessage] = useState("");
  const key = JSON.stringify(spec);
  const text = draft?.key === key ? draft.text : "";
  return <details className="chat-handoff no-print"><summary>Continue this research through chat</summary><p>Prepare a prompt with public tract IDs, fields, and criteria. Review it before copying to your own chat. Private notes, project names, addresses, coordinates, and credentials are excluded.</p><p><Link href="/use-with-claude">Connect an MCP client and accept its terms first →</Link> Website membership does not extend public MCP limits.</p><button type="button" className="button secondary" onClick={() => { try { setDraft({ key, text: chatHandoff(spec, window.location.origin) }); setMessage(""); } catch (e) { setMessage((e as Error).message); } }}>Prepare chat handoff</button>{text && <><label>Review public research prompt<textarea rows={7} readOnly value={text} /></label><button type="button" className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setMessage("Copied. Paste into your connected chat when ready."); } catch { setMessage("Select and copy the prompt above; clipboard access is unavailable."); } }}>Copy reviewed prompt</button></>}<p role="status">{message}</p></details>;
}
