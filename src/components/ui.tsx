import type { Category, DraftStatus, FindingStatus, Role, Severity } from "@/lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

const STATUS: Record<DraftStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  in_review: { label: "In review", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  changes_requested: { label: "Changes requested", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

export function StatusPill({ status }: { status: DraftStatus }) {
  const s = STATUS[status];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", s.cls)}>{s.label}</span>;
}

const SEV: Record<Severity, string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-sky-50 text-sky-700 ring-sky-200",
};
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cx("inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset", SEV[severity])}>
      {severity}
    </span>
  );
}

export const CATEGORY_LABEL: Record<Category, string> = {
  tone: "Tone",
  terminology: "Terminology",
  claims: "Claims",
  messaging: "Facts & messaging",
  accessibility: "Accessibility",
  visual: "Visual",
};

export function CategoryBadge({ category }: { category: Category }) {
  return <span className="text-xs font-medium text-slate-500">{CATEGORY_LABEL[category]}</span>;
}

const FSTATUS: Record<FindingStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "text-slate-600 bg-slate-100" },
  accepted: { label: "Fix accepted", cls: "text-emerald-700 bg-emerald-50" },
  edited: { label: "Edited fix", cls: "text-emerald-700 bg-emerald-50" },
  disputed: { label: "Disputed", cls: "text-orange-700 bg-orange-50" },
};
export function FindingStatusTag({ status }: { status: FindingStatus }) {
  const s = FSTATUS[status];
  return <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-medium", s.cls)}>{s.label}</span>;
}

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", reviewer: "Reviewer", creator: "Creator" };

export function RoleBadge({ role }: { role: Role }) {
  const cls = role === "admin" ? "bg-ink text-white" : role === "reviewer" ? "bg-violet-600 text-white" : "bg-brand-600 text-white";
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{ROLE_LABEL[role]}</span>;
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="currentColor" className="text-brand-600" />
        <path d="m8.5 12 2.4 2.4 4.6-4.8" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      BrandGuard
    </span>
  );
}
