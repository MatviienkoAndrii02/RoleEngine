"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

export function EffectEditorSection({
  title,
  summary,
  error,
  children,
  defaultOpen = true,
}: {
  title: string;
  summary?: string;
  error?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("rounded-md border bg-background", error && "border-destructive/60", open ? "p-3" : "px-3 py-2")}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="shrink-0 text-sm font-medium">{title}</span>
          {summary && <span className="min-w-0 truncate text-xs text-muted-foreground">{summary}</span>}
        </button>
        {error && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-destructive" title={error}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden max-w-40 truncate sm:inline">{error}</span>
          </span>
        )}
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen((current) => !current)}>
          {open ? t("common.collapse") : t("common.expand")}
        </Button>
      </div>
      {error && open && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className={cn("mt-3 space-y-3", !open && "hidden")}>{children}</div>
    </section>
  );
}
