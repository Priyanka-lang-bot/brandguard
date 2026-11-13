import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Logo, RoleBadge } from "@/components/ui";
import { RoleSwitcher } from "@/components/role-switcher";
import { NavLink } from "@/components/nav-link";
import { requireProfile } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await requireProfile();
  const isDemo = user.email?.endsWith("@brandguard.demo");
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/dashboard" aria-label="BrandGuard home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/dashboard">Dashboard</NavLink>
            {profile.role !== "reviewer" && <NavLink href="/drafts/new">New draft</NavLink>}
            <NavLink href="/brand-kit">Brand Kit</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {isDemo ? (
              <RoleSwitcher current={profile.role} />
            ) : (
              <span className="flex items-center gap-2 text-sm">
                {profile.full_name} <RoleBadge role={profile.role} />
              </span>
            )}
            <form action={signOut}>
              <button className="btn-ghost btn-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
