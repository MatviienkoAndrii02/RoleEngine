"use client";

import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCharacterUiStore } from "@/store/character-ui-store";
import { cn } from "@/lib/utils";

export function SidebarSection({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const open = useCharacterUiStore((state) => state.openSidebarSectionIds.has(id));
  const toggle = useCharacterUiStore((state) => state.toggleSidebarSection);
  const scrollRequest = useCharacterUiStore((state) => state.sidebarScrollRequest);

  useEffect(() => {
    if (!open || scrollRequest?.sectionId !== id) return;
    const handle = window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
    return () => window.clearTimeout(handle);
  }, [id, open, scrollRequest]);

  return (
    <div ref={ref}>
      <Card>
        <CardHeader className="p-0">
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-between rounded-md px-4 py-4 text-left"
            aria-expanded={open}
            aria-controls={`${id}-content`}
            onClick={() => toggle(id)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <CardTitle className="truncate text-base">{title}</CardTitle>
              {count !== undefined && <span className="text-xs font-normal text-muted-foreground">{count}</span>}
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </Button>
        </CardHeader>
        {open && (
          <CardContent id={`${id}-content`} className="border-t pt-4">
            {children}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
