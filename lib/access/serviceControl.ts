import { AccessError, db } from "./store";
export type ServiceName = "exports" | "signup" | "mcp";
export async function servicePaused(service: ServiceName) {
  return process.env[`OZ_${service.toUpperCase()}_PAUSED`] === "1" || !!await db().prepare("SELECT 1 FROM settings WHERE key=? AND value='1'").get(service === "mcp" ? "mcp-paused" : `${service}-paused`);
}
export async function requireService(service: ServiceName) {
  if (await servicePaused(service)) throw new AccessError(`${service === "signup" ? "New accounts" : service === "exports" ? "New exports" : "Chat research"} are temporarily paused. Your existing research selections remain available.`, 503);
}
