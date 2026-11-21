import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Logo, RoleBadge } from "@/components/ui";
import { RoleSwitcher } from "@/components/role-switcher";
import { NavLink } from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireProfile } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await requireProfile();
  const isDemo = user.email?.endsWith("@brandguard.demo");
  return (
    <div className="min-h-screen bg-paper paper-grain">
      <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
          <Link href="/dashboard" aria-label="BrandGuard home">
            <Logo className="text-[17px]" />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/dashboard">Dashboard</NavLink>
            {profile.role !== "reviewer" && <NavLink href="/drafts/new">New draft</NavLink>}
            <NavLink href="/brand-kit">Brand Kit</NavLink>
            {profile.role === "admin" && <NavLink href="/insights">Insights</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link href="/ai-disclosure" className="hidden text-xs font-medium text-ink-soft underline decoration-proof/50 underline-offset-4 hover:text-ink md:inline">AI disclosure</Link>
            {isDemo ? (
              <RoleSwitcher current={profile.role} />
            ) : (
              <span className="flex items-center gap-2 text-sm">
                {profile.full_name} <RoleBadge role={profile.role} />
              </span>
            )}
            <ThemeToggle />
            <form action={signOut}>
              <button className="btn-ghost btn-sm">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
