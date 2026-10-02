import Link from "next/link";
import LegalDocument from "../ui/LegalDocument";
import PrintButton from "../ui/PrintButton";

export const metadata = { title: "Disclaimer, Terms & Privacy | Opportunity Zone Research" };
export default function LegalPage() {
  return <main className="page legal-page"><p className="eyebrow">Understand the service</p><h1>Disclaimer, terms & privacy</h1><p className="lead">The purpose of this service, its limitations, and the terms for using it. This page is always available, including before acceptance.</p><nav className="legal-contents" aria-label="Legal sections"><a href="#disclaimer">Full disclaimer</a><a href="#terms">Terms of Use</a><a href="#privacy">Privacy notice</a></nav><div className="answer-actions no-print"><PrintButton /><Link className="button secondary" href="/">Return to Research Hub</Link></div><LegalDocument /><div className="answer-actions no-print"><Link className="button" href="/">Return to Research Hub</Link></div></main>;
}
