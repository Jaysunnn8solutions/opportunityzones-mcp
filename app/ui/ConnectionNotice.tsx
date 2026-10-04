"use client";
import { useEffect, useState } from "react";
export default function ConnectionNotice() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const offline = () => setMessage("You appear to be offline. Keep this tab open: your selections remain in memory. Save on this device before refreshing.");
    const online = () => setMessage("Your connection is back. Retry the interrupted request when you are ready; selections have not been reset.");
    if (!navigator.onLine) offline();
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, []);
  return message ? <aside className="connection-notice no-print" role="status">{message} <button type="button" className="link" onClick={() => setMessage("")}>Dismiss</button></aside> : null;
}
