"use client";

import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={cn("rounded-md border bg-background", error && "border-destructive/60", open ? "p-3" : "px-3 py-2")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        className="flex min-h-10 w-full min-w-0 items-start gap-2 text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          {summary && <span className="mt-0.5 block line-clamp-2 break-words text-xs text-muted-foreground" title={summary}>{summary}</span>}
        </span>
        {error && <span className="mt-0.5 shrink-0 text-destructive" title={error}><AlertTriangle className="h-4 w-4" /></span>}
      </button>
      {error && open && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div id={contentId} className={cn("mt-3 space-y-3", !open && "hidden")}>{children}</div>
    </section>
  );
}
