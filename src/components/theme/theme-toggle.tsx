"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "./theme-script";

type Theme = "light" | "dark";

function apply(t: Theme) {
  const d = document.documentElement;
  d.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

/** Accessible light/dark switch. The current theme lives on <html data-theme>, set before paint by ThemeScript. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    // Keep several toggles (and other tabs) in step.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        apply(e.newValue);
        setTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const next: Theme = theme === "light" ? "dark" : "light";
  const label = `Switch to ${next} theme`;
  return (
    <button
      type="button"
      onClick={() => {
        apply(next);
        setTheme(next);
      }}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-soft transition hover:border-ink hover:text-ink ${className}`}
    >
      {/* Before mount both icons are hidden by CSS so server and client markup match. */}
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="theme-icon-sun">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
      </svg>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="theme-icon-moon">
        <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
      </svg>
    </button>
  );
}
