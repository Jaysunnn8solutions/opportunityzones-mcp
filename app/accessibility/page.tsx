import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Accessibility and research without a map" };

export default function AccessibilityPage() {
  return <main className="page prose">
    <h1>Accessibility and research without a map</h1>
    <p className="lead">Research published place information using forms, text results, comparisons, or a compatible chat client. You do not need to use a map.</p>
    <p>We are working toward WCAG 2.2 Level AA. This is a work in progress, not a claim of full conformance or legal certification. Automated checks cannot replace testing with disabled users and assistive technology.</p>
    <h2>Choose how to research</h2>
    <ul>
      <li><Link href="/">Research Hub</Link>: enter an address or an 11-digit census tract identifier.</li>
      <li><Link href="/map#m=list">Find areas in List view</Link>: choose a state, apply filters, and open labeled tract results. This uses the same criteria as the map.</li>
      <li><Link href="/compare">Compare selected tracts</Link>: read a table with named rows, column headings, sources, and missing-data labels.</li>
      <li><Link href="/use-with-claude">Research through chat / MCP</Link>: discover geography identifiers, list tracts, read profiles and rules, and compare two selected tracts in text.</li>
    </ul>
    <h2>Keyboard, zoom, and motion</h2>
    <ul>
      <li>Use the first link, “Skip to content,” to bypass the main navigation.</li>
      <li>Tab and Shift+Tab move between controls. Enter activates links and buttons; Space toggles checkboxes. Research Hub tabs also support arrow keys, Home, and End.</li>
      <li>Dialogs have a Close button and support Escape. Browser-native dialog behavior keeps focus inside until the dialog closes.</li>
      <li>Use your browser’s zoom and text settings. Wide comparison tables have a keyboard-focusable scrolling region.</li>
      <li>The entry animation has a Pause motion control and respects your device’s reduced-motion preference. The animation is decorative; it contains no required research information.</li>
      <li>The map supports keyboard panning and zooming, but geographic feature selection is best accessed through List view or a tract search.</li>
    </ul>
    <h2>Chat access and its limits</h2>
    <p>The MCP server returns labeled text, sources, dates, and structured values for supported tools. Ask your client for short sections, a plain-language explanation of a measure, or a list instead of a table. Voice and screen-reader support depend on your chosen client, and the client may have its own cost and privacy terms. This service does not call a language model.</p>
    <p>Public MCP requests have shared usage limits. Live address lookup, live site enrichment, downloads, and member-only numeric filters remain website features. Website sign-in does not sign an external chat client into your account. Public website browsing does not require an account; limited downloads require a free passkey account.</p>
    <h2>Known limitations and ongoing testing</h2>
    <ul>
      <li>The visual map and third-party map controls are not a complete screen-reader experience; use text results for tract selection and facts.</li>
      <li>Basemap providers, external source websites, chat clients, and passkey prompts have their own accessibility behavior.</li>
      <li>Compatibility testing with NVDA, JAWS, VoiceOver, TalkBack, 400% zoom, and real mobile devices is still needed. Color-contrast and forced-color behavior also need visual checks in supported browsers.</li>
      <li>Printed or browser-generated PDFs are not yet verified as tagged, accessible documents. The HTML reports and text-based MCP responses are the primary alternatives.</li>
    </ul>
    <h2>Report an access barrier</h2>
    <p><a href="https://github.com/Jaysunnn8solutions/opportunityzones-mcp/issues/new?title=Accessibility%20barrier">Report an accessibility issue in the public repository</a>. Include the page, the task you were trying to complete, and your browser or assistive technology if you wish. A GitHub account is required; reports are public. Do not include addresses, account recovery codes, private research, or medical details. A private contact method is not yet configured.</p>
    <p><a href="https://www.w3.org/TR/WCAG22/">Read WCAG 2.2</a> · <Link href="/legal">Disclaimer, terms, and privacy notice</Link></p>
    <p className="note">Informational only, not investment, tax or legal advice. Tools describe places and do not recommend locations or assess anyone’s suitability.</p>
  </main>;
}
