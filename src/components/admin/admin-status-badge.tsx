"use client";

import type { AdminHealthState } from "@/domain/admin-console";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/client";

const stateClasses: Record<AdminHealthState, string> = {
  UP: "bg-emerald-100 text-emerald-900",
  DOWN: "bg-destructive/10 text-destructive",
  UNKNOWN: "bg-muted text-muted-foreground",
};

export function AdminStatusBadge({ state }: { state: AdminHealthState }) {
  const { t } = useI18n();
  return <Badge className={stateClasses[state]}>{`● ${t(`admin.status.${state}`)}`}</Badge>;
}