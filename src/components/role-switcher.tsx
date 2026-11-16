"use client";

import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { switchDemoRole } from "@/app/actions/auth";
import type { Role } from "@/lib/types";

const OPTIONS: { role: Role; label: string }[] = [
  { role: "creator", label: "Kabir · Creator" },
  { role: "reviewer", label: "Riya · Reviewer" },
  { role: "admin", label: "Asha · Admin" },
];

export function RoleSwitcher({ current }: { current: Role }) {
  const path = usePathname();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-mute sm:inline">Viewing as</span>
      <select
        className="rounded-lg border border-line-strong bg-surface py-1 pl-2 pr-7 text-sm font-medium"
        value={current}
        disabled={pending}
        onChange={(e) => start(() => switchDemoRole(e.target.value as Role, path))}
        aria-label="Switch demo role"
      >
        {OPTIONS.map((o) => (
          <option key={o.role} value={o.role}>
            {o.label}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-mute">Switching…</span>}
    </label>
  );
}
