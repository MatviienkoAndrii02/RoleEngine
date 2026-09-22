"use client";

import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";

// Reserved console sections render an explicit notice instead of mock data, so the
// console never looks like a working monitoring stack that does not exist yet.
export function AdminPlaceholder({ titleKey, descriptionKey }: { titleKey: string; descriptionKey: string }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t(titleKey)}</CardTitle>
        <Badge>{t("admin.placeholder.badge")}</Badge>
      </CardHeader>
      <CardContent className="flex items-start gap-3">
        <Construction className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t(descriptionKey)}</p>
      </CardContent>
    </Card>
  );
}