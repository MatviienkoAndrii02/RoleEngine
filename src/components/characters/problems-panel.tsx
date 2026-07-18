"use client";

import { AlertTriangle, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/client";

export type ProblemSeverity = "error" | "warning";

export type ProblemItem = {
  id: string;
  severity: ProblemSeverity;
  title: string;
  description?: string;
  details?: string[];
};

export function ProblemsPanel({ problems }: { problems: ProblemItem[] }) {
  const { t } = useI18n();
  if (problems.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/70">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base text-amber-950">
            <AlertTriangle className="h-5 w-5" />
            {t("problems.title")}
          </CardTitle>
          <Badge className="bg-amber-100 text-amber-950">{t("problems.count", { count: problems.length })}</Badge>
        </div>
        {/* <p className="text-sm text-amber-950/80">{t("problems.description")}</p> */}
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {problems.map((problem) => (
            <li key={problem.id} className="rounded-md border border-amber-200 bg-background p-3">
              <div className="flex items-start gap-3">
                <CircleAlert className={problem.severity === "error" ? "mt-0.5 h-4 w-4 shrink-0 text-destructive" : "mt-0.5 h-4 w-4 shrink-0 text-amber-600"} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{problem.title}</span>
                    <Badge className={problem.severity === "error" ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-950"}>
                      {problem.severity === "error" ? t("problems.severity.error") : t("problems.severity.warning")}
                    </Badge>
                  </div>
                  {problem.description && <p className="text-sm text-muted-foreground">{problem.description}</p>}
                  {problem.details && problem.details.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {problem.details.map((detail, index) => <li key={`${problem.id}-${index}`}>{detail}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
