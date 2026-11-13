"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active =
    path === href ||
    (href === "/brand-kit" && path.startsWith("/brand-kit")) ||
    (href === "/dashboard" && path.startsWith("/drafts/") && path !== "/drafts/new");
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 font-medium transition ${active ? "bg-slate-100 text-ink" : "text-slate-600 hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
