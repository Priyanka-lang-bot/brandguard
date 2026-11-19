"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active =
    path === href ||
    (href === "/brand-kit" && path.startsWith("/brand-kit")) ||
    (href === "/insights" && path.startsWith("/insights")) ||
    (href === "/dashboard" && path.startsWith("/drafts/") && path !== "/drafts/new");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3.5 py-1.5 font-semibold transition ${active ? "bg-ink text-paper" : "text-ink-soft hover:bg-ink/6 hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
