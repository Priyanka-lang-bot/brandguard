import type { Category, DraftStatus, FindingStatus, Role, Severity } from "@/lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

const STATUS: Record<DraftStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-line text-soft ring-line" },
  in_review: { label: "In review", cls: "bg-violet-500/10 text-violet-300 ring-violet-500/30" },
  changes_requested: { label: "Changes requested", cls: "bg-amber-500/10 text-amber-300 ring-amber-500/30" },
  approved: { label: "Approved", cls: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30" },
};

export function StatusPill({ status }: { status: DraftStatus }) {
  const s = STATUS[status];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", s.cls)}>{s.label}</span>;
}

const SEV: Record<Severity, string> = {
  high: "bg-red-500/10 text-red-300 ring-red-500/30",
  medium: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  low: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
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
  return <span className="text-xs font-medium text-mute">{CATEGORY_LABEL[category]}</span>;
}

const FSTATUS: Record<FindingStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "text-mute bg-line" },
  accepted: { label: "Fix accepted", cls: "text-emerald-300 bg-emerald-500/10" },
  edited: { label: "Edited fix", cls: "text-emerald-300 bg-emerald-500/10" },
  disputed: { label: "Disputed", cls: "text-orange-300 bg-orange-500/10" },
};
export function FindingStatusTag({ status }: { status: FindingStatus }) {
  const s = FSTATUS[status];
  return <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-medium", s.cls)}>{s.label}</span>;
}

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", reviewer: "Reviewer", creator: "Creator" };

export function RoleBadge({ role }: { role: Role }) {
  const cls = role === "admin" ? "bg-slate-600 text-white" : role === "reviewer" ? "bg-violet-600 text-white" : "bg-brand-600 text-white";
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
        <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="currentColor" className="text-brand-300" />
        <path d="m8.5 12 2.4 2.4 4.6-4.8" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      BrandGuard
    </span>
  );
}
