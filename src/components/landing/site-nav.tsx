"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "@/components/theme/theme-toggle";


export function SiteNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background,box-shadow] duration-300 ${
        scrolled || open ? "bg-paper/90 shadow-[0_1px_0_rgb(14_15_20/0.1)] backdrop-blur-md" : "bg-transparent"
      }`}
    >
      {/* Reading progress */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-proof" style={{ transform: `scaleX(${progress})` }} />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <nav aria-label="Main" className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="BrandGuard home" className="text-ink [&_svg_path:first-child]:text-ink">
          <Logo className="font-display text-[17px] [font-stretch:110%]" />
        </Link>
        <ul className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="rounded-full px-3 py-1.5 text-[14px] font-medium text-ink-soft transition hover:bg-ink/5 hover:text-ink">
                {n.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Link href="/dashboard" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper transition hover:bg-ink-soft">
              Open workspace →
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-full px-3 py-2 text-sm font-semibold text-ink hover:bg-ink/5 sm:inline-block">
                Sign in
              </Link>
              <Link href="/login" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper transition hover:-translate-y-px hover:bg-ink-soft">
                Get started
              </Link>
            </>
          )}
          <button
            type="button"
            className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
            </svg>
          </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-menu" className="border-t border-ink/10 bg-paper px-5 pb-6 pt-2 lg:hidden">
          <ul className="grid">
            {NAV_ITEMS.map((n) => (
              <li key={n.href}>
                <a href={n.href} onClick={() => setOpen(false)} className="display-tight block border-b border-ink/10 py-3 text-3xl">
                  {n.label}
                </a>
              </li>
            ))}
            {!signedIn && (
              <li>
                <Link href="/login" className="display-tight block py-3 text-3xl text-proof">
                  Sign in
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </header>
  );
}
