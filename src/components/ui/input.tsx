import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:text-sm",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
