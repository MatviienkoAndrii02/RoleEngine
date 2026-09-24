"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/i18n/client";

export function ThemeSwitcher({ initialDark = false, compact = false }: { initialDark?: boolean; compact?: boolean }) {
  const { t } = useI18n();
  const [isDark, setIsDark] = useState(initialDark);
  const label = t(isDark ? "theme.switchToLight" : "theme.switchToDark");

  function toggleTheme() {
    const nextIsDark = !isDark;
    document.documentElement.classList.toggle("dark", nextIsDark);
    document.documentElement.style.colorScheme = nextIsDark ? "dark" : "light";
    document.cookie = `role-engine-theme=${nextIsDark ? "dark" : "light"}; path=/; max-age=31536000; SameSite=Lax`;
    setIsDark(nextIsDark);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-input bg-background text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${compact ? "w-10 px-0" : "px-3"}`}
    >
      {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
      {!compact && <span>{label}</span>}
    </button>
  );
}
