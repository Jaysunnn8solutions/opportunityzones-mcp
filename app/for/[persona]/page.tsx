import { permanentRedirect } from "next/navigation";

/** Retired role-specific URLs lead to the same general information for everyone. */
export default function RetiredRolePage() {
  permanentRedirect("/guide");
}
