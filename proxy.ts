import { NextRequest, NextResponse } from "next/server";
import { hasConsent } from "@/lib/access/consent";
import { isPublicLegalPage } from "@/lib/client/termsConsent";

/** All hosted research pages, APIs, RSC requests, and data files pass this gate. */
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/\/$/, "") || "/";
  if (path === "/oauth/authorize") {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    response.headers.set("X-Frame-Options", "DENY");
    return response;
  }
  // Account/connection endpoints enforce their own authentication and explicit
  // acceptance, so MCP setup also works directly from the public instructions.
  if (["/api/account", "/api/mcp-connections", "/api/oauth/approve", "/oauth/register", "/oauth/token", "/oauth/revoke", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server"].includes(path)) { const response = NextResponse.next(); response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer"); return response; }
  // Public documents and UI assets are necessary to review the agreement.
  // MCP checks its own, separate bearer receipt in the route handler.
  if (isPublicLegalPage(path) || ["/entry", "/entry/agreement", "/api/consent", "/mcp", "/favicon.ico", "/entry-population-lights.svg"].includes(path) || path.startsWith("/_next/static/") || path.startsWith("/_next/webpack-hmr")) return NextResponse.next();
  let accepted = false;
  try { accepted = (await hasConsent(req, "web")); } catch { /* Fail closed if the receipt store is unavailable. */ }
  if (accepted) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (path.startsWith("/api/") || path.startsWith("/boundaries/") || path.startsWith("/sprites/") || path.startsWith("/maplibre/") || !["GET", "HEAD"].includes(req.method)) return NextResponse.json({ error: "Terms acceptance required.", termsUrl: "/legal", entryUrl: "/entry" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const destination = new URL("/entry", req.url);
  // Preserve only the route. Research query strings are not put in consent URLs.
  destination.searchParams.set("next", path);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
