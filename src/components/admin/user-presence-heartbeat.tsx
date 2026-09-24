"use client";

import { useEffect } from "react";
import { USER_PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/domain/user-presence";

export function UserPresenceHeartbeat() {
  useEffect(() => {
    let requestInFlight = false;

    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible" || requestInFlight) return;
      requestInFlight = true;
      void fetch("/api/account/presence", { method: "POST", cache: "no-store", keepalive: true })
        .catch(() => undefined)
        .finally(() => {
          requestInFlight = false;
        });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") sendHeartbeat();
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, USER_PRESENCE_HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", sendHeartbeat);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", sendHeartbeat);
    };
  }, []);

  return null;
}
