import Link from "next/link";
import { demoSignIn } from "@/app/actions/auth";
import { Logo } from "@/components/ui";
import { Reveal } from "@/components/landing/reveal";
import { LoginForm } from "./login-form";
import { DemoButton } from "./demo-button";

export const metadata = { title: "Sign in · BrandGuard" };

const ROLES = [
  { role: "creator" as const, who: "Kabir", name: "Creator", blurb: "Write or upload a draft, get cited findings, fix them and send for review." },
  { role: "reviewer" as const, who: "Riya", name: "Reviewer", blurb: "Open the review queue, see what changed and any disputes, then approve." },
  { role: "admin" as const, who: "Asha", name: "Admin", blurb: "Run the Brand Kit and Insights: rules, terms, facts, visuals, confidential terms." },
];

const PRINCIPLES = [
  ["Grounded, not guessed", "A finding without a real Brand Kit source is thrown away."],
  ["Suggest, never override", "You accept, edit or dispute each fix. Nothing changes silently."],
  ["Humans decide", "Only a reviewer can approve. Disputes are recorded, not hidden."],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="landing paper-grain min-h-screen">
      <header className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="BrandGuard home">
          <Logo className="text-[17px]" />
        </Link>
        <Link href="/" className="rounded-full px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-ink/5 hover:text-ink">
          ← Back to the website
        </Link>
      </header>

      <main id="main" className="mx-auto grid max-w-[1400px] gap-12 px-5 pb-20 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:pt-12">
        <Reveal as="section" className="self-center">
          <p className="kicker reveal flex items-center gap-2 text-ink-soft">
            <span className="inline-block h-2 w-2 rounded-full bg-proof" /> Sign in to BrandGuard
          </p>
          <h1 className="mt-6">
            <span className="display-wide reveal block text-[clamp(2.8rem,7.4vw,7rem)]">Every word,</span>
            <span className="reveal reveal-d1 block font-serif text-[clamp(3rem,8vw,7.6rem)] italic leading-[0.95] tracking-[-0.02em]">
              <span className="mark-sweep">on-brand.</span>
            </span>
          </h1>
          <p className="reveal reveal-d2 mt-6 max-w-lg text-lg leading-relaxed text-ink-soft">
            BrandGuard checks each draft against your guidelines, terminology, approved facts and visual identity. Every finding quotes the
            exact words and cites the rule it breaks.
          </p>
          <ol className="reveal reveal-d3 mt-10 max-w-lg divide-y-2 divide-ink border-y-2 border-ink">
            {PRINCIPLES.map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[2.6rem_1fr] gap-3 py-4">
                <span className="font-serif text-2xl italic leading-none text-proof">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[15px] leading-relaxed text-ink-soft">
                  <strong className="font-display font-bold text-ink">{t}.</strong> {d}
                </span>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal as="section" className="self-center">
          <div className="clipping reveal relative rounded-2xl p-6 sm:p-8">
            <span className="tape -top-3 left-10 rotate-[-4deg]" aria-hidden />
            <p className="kicker text-ink-soft">Demo workspace · Lumio</p>
            <h2 className="mt-2 font-serif text-4xl leading-tight">Try it as…</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Lumio is a made-up study app. Pick a role. You can switch any time from the top bar.
            </p>
            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-proof/30 bg-proof/10 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <div className="mt-6 grid gap-3">
              {ROLES.map((r, i) => (
                <form key={r.role} action={demoSignIn.bind(null, r.role)}>
                  <DemoButton
                    label={`Sign in as ${r.who}, ${r.name}`}
                    className={`group relative w-full rounded-xl border-2 p-4 text-left transition hover:-translate-y-0.5 focus-visible:-translate-y-0.5 ${
                      i === 0 ? "border-ink bg-ink text-paper" : "border-ink/15 bg-white/60 hover:border-ink"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex items-baseline gap-3">
                        <span className="display-tight text-3xl">{r.name}</span>
                        <span className={`text-sm ${i === 0 ? "text-paper/70" : "text-ink-soft"}`}>as {r.who}</span>
                      </span>
                      <span aria-hidden className="text-xl transition group-hover:translate-x-1">→</span>
                    </span>
                    <span className={`mt-1 block text-sm ${i === 0 ? "text-paper/75" : "text-ink-soft"}`}>{r.blurb}</span>
                    {i === 0 && (
                      <span className="kicker absolute -top-3 right-4 rounded-full bg-marker px-2.5 py-1 text-[10px] text-ink">Start here</span>
                    )}
                  </DemoButton>
                </form>
              ))}
            </div>
            <details className="group mt-7 border-t-2 border-ink/80 pt-4 text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-ink">
                Sign in or create an account with email
                <span aria-hidden className="transition group-open:rotate-45">+</span>
              </summary>
              <LoginForm />
            </details>
          </div>
          <p className="mt-4 text-center text-xs text-ink-soft/80">
            Read what goes to the AI in the{" "}
            <Link href="/ai-disclosure" className="font-semibold underline decoration-proof decoration-2 underline-offset-4">
              AI disclosure
            </Link>
            .
          </p>
        </Reveal>
      </main>
    </div>
  );
}
