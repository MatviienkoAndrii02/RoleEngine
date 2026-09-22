"use client";

import { useCallback, useEffect, useState } from "react";
import { localizedApiError } from "@/i18n/api-errors";
import { useI18n } from "@/i18n/client";
import { adminApiUrl } from "@/lib/admin-api";

// Thin client for the admin API namespace: the admin UI talks only to /admin-api, so the
// console can later be served from a separate origin or deployment without a rewrite.
export function useAdminResource<T>(
  path: string,
  fallbackErrorKey: string,
  isPayload: (value: unknown) => value is T,
) {
  const { t } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(adminApiUrl(path), {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        setError(await localizedApiError(response, t, fallbackErrorKey));
        setData(null);
        return;
      }
      const payload: unknown = await response.json();
      if (!isPayload(payload)) {
        setError(t(fallbackErrorKey));
        setData(null);
        return;
      }
      setData(payload);
      setError(null);
    } catch {
      setError(t(fallbackErrorKey));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fallbackErrorKey, isPayload, path, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}