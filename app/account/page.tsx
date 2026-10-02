import type { Metadata } from "next";
import { AccountSettings } from "../ui/AccountAccess";
import McpConsent from "../ui/McpConsent";

export const metadata: Metadata = { title: "My account" };
export default function AccountPage() {
  return <main className="page prose"><h1>My account</h1><p className="lead">Manage access, security, and connected apps.</p><p>This account uses passkeys instead of passwords. We do not collect email addresses. Manage your passkeys and recovery codes below.</p><AccountSettings /><McpConsent /></main>;
}
