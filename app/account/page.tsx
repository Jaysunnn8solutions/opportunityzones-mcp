import type { Metadata } from "next";
import { AccountSettings } from "../ui/AccountAccess";
import McpConsent from "../ui/McpConsent";
import AccountCenter, { AccountNavigation } from "../ui/AccountCenter";

export const metadata: Metadata = { title: "My account" };
export default function AccountPage() {
  return <main className="page account-page"><h1>My account</h1><p className="lead">Your access, research downloads, and connected apps in one place.</p><AccountNavigation /><AccountSettings /><McpConsent /><AccountCenter /></main>;
}
