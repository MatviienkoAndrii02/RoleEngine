"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 4000;

export function CharacterLiveRefresh({
  characterId,
  initialVersion,
  enabled,
}: {
  characterId: string;
  initialVersion: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const versionRef = useRef(initialVersion);
  const pendingRef = useRef(false);

  useEffect(() => {
    versionRef.current = initialVersion;
  }, [initialVersion]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function checkVersion() {
      if (pendingRef.current) return;
      pendingRef.current = true;
      try {
        const response = await fetch(`/api/characters/${characterId}/version`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const payload = await response.json() as { version?: unknown };
        if (typeof payload.version !== "string" || payload.version === versionRef.current) return;
        versionRef.current = payload.version;
        if (!cancelled) router.refresh();
      } finally {
        pendingRef.current = false;
      }
    }

    const interval = window.setInterval(checkVersion, POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (!document.hidden) void checkVersion();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [characterId, enabled, router]);

  return null;
}
