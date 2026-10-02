import OAuthConsent from "@/app/ui/OAuthConsent";
export const dynamic = "force-dynamic";
export const metadata = { title: "Connect your research client", robots: { index: false, follow: false } };
export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <main className="page prose"><p className="eyebrow">Private MCP connection</p><h1>Review this connection</h1><OAuthConsent parameters={await searchParams} /></main>;
}
