export function isPublicLegalPage(path: string): boolean { return ["/legal", "/accessibility", "/use-with-claude", "/account", "/oauth/authorize"].includes(path.replace(/\/$/, "")); }

export function entryDestination(value: string | null): string {
  if (!value || !/^\/[a-zA-Z0-9/_-]*$/.test(value) || value.startsWith("//") || /^\/(entry|api|_next|mcp)(\/|$)/.test(value)) return "/";
  return value;
}

/** Keep a research deep link in the browser through the entry gate; never send its fragment to the server. */
export function entryReturnDestination(value: string | null, fragment: string): string {
  const destination = entryDestination(value);
  const acceptsResearch = /^\/(map|compare|brief|workbench)$/.test(destination) || /^\/tract\/\d{11}$/.test(destination);
  return acceptsResearch && fragment.startsWith("#") && fragment.length <= 64_000 ? destination + fragment : destination;
}
