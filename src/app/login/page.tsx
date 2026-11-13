import { demoSignIn } from "@/app/actions/auth";
import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

const ROLES = [
  {
    role: "creator" as const,
    name: "Kabir · Creator",
    blurb: "Write or upload a draft, get cited findings, fix them and send for review.",
    tone: "border-brand-200 hover:border-brand-500 hover:bg-brand-50",
  },
  {
    role: "reviewer" as const,
    name: "Riya · Reviewer",
    blurb: "Open the review queue, see what changed and any disputes, then approve.",
    tone: "border-violet-200 hover:border-violet-500 hover:bg-violet-50",
  },
  {
    role: "admin" as const,
    name: "Asha · Admin",
    blurb: "Manage the Brand Kit: rules, terminology, facts, and import a guideline PDF.",
    tone: "border-slate-300 hover:border-slate-700 hover:bg-slate-50",
  },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 to-slate-50">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-14 lg:grid-cols-[1.2fr_1fr] lg:py-20">
        <section>
          <Logo className="text-xl" />
          <h1 className="mt-8 text-4xl font-semibold leading-tight tracking-tight text-ink">
            Catch off-brand content
            <br />
            before it goes live.
          </h1>
          <p className="mt-4 max-w-lg text-lg text-slate-600">
            BrandGuard checks a draft against your own guidelines, terminology and approved facts. Every finding quotes
            the exact words, cites the rule it breaks and offers a minimal fix. A person always makes the final call.
          </p>
          <ul className="mt-8 grid max-w-lg gap-3 text-sm text-slate-700">
            {[
              ["Grounded, not guessed", "A finding without a real Brand Kit source is thrown away."],
              ["Suggest, never override", "You accept, edit or dispute each fix. Nothing changes silently."],
              ["Humans decide", "Only a reviewer can approve. Disputes are recorded, not hidden."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                <span>
                  <strong className="font-semibold text-ink">{t}.</strong> {d}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="text-lg font-semibold">Try the demo</h2>
          <p className="mt-1 text-sm text-slate-600">
            The demo brand is <strong>Lumio</strong>, a made-up study app. Pick a role — you can switch at any time from the top bar.
          </p>
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-5 grid gap-3">
            {ROLES.map((r, i) => (
              <form key={r.role} action={demoSignIn.bind(null, r.role)}>
                <button type="submit" className={`w-full rounded-xl border-2 bg-white p-4 text-left transition ${r.tone}`}>
                  <span className="flex items-center justify-between">
                    <span className="font-semibold">{r.name}</span>
                    {i === 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">Start here</span>}
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">{r.blurb}</span>
                </button>
              </form>
            ))}
          </div>
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-800">Sign in with email instead</summary>
            <LoginForm />
          </details>
        </section>
      </div>
    </main>
  );
}
