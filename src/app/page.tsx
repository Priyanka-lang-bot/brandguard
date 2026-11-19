import Link from "next/link";
import { Logo } from "@/components/ui";
import { Reveal } from "@/components/landing/reveal";
import { NAV_ITEMS } from "@/components/landing/nav-items";
import { SiteNav } from "@/components/landing/site-nav";
import { WorkflowDemo } from "@/components/landing/workflow-demo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BrandGuard — Your brand has a voice. Make sure every piece of content speaks it.",
  description:
    "BrandGuard checks every draft against your brand guidelines, approved facts and visual identity before it reaches your audience.",
};

async function isSignedIn() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return Boolean(data.user);
  } catch {
    return false;
  }
}

const REPO = "https://github.com/Priyanka-lang-bot/brandguard";

export default async function Landing() {
  const signedIn = await isSignedIn();
  const startHref = signedIn ? "/dashboard" : "/login";
  return (
    <div className="landing min-h-screen overflow-x-clip">
      <SiteNav signedIn={signedIn} />
      <main id="main">
        <Hero startHref={startHref} signedIn={signedIn} />
        <Marquee />
        <Problem />
        <Product />
        <Features />
        <Workflow />
        <Insights />
        <Security />
        <About />
        <FinalCta startHref={startHref} signedIn={signedIn} />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Hero({ startHref, signedIn }: { startHref: string; signedIn: boolean }) {
  return (
    <Reveal as="section" className="paper-grain relative pt-[104px] sm:pt-[120px]">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <p className="kicker reveal flex items-center gap-2 text-ink-soft">
          <span className="inline-block h-2 w-2 rounded-full bg-proof" /> Brand governance for content teams
        </p>
        <h1 className="mt-6">
          <span className="display-wide reveal block text-[clamp(3.1rem,11.2vw,11.5rem)]">Your brand</span>
          <span className="display-wide reveal reveal-d1 block text-[clamp(3.1rem,11.2vw,11.5rem)]">
            has a <span className="font-serif font-normal normal-case italic tracking-[-0.02em] [font-stretch:100%]"><span className="mark-sweep">voice.</span></span>
          </span>
          <span className="reveal reveal-d2 mt-5 block max-w-4xl font-serif text-[clamp(1.9rem,4.4vw,4.1rem)] leading-[1.02] tracking-[-0.01em]">
            Make sure every piece of content <em className="text-proof">speaks it.</em>
          </span>
        </h1>

        <div className="mt-10 grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="reveal reveal-d3 pb-4">
            <p className="max-w-md text-lg leading-relaxed text-ink-soft">
              BrandGuard checks every draft against your brand guidelines, approved facts and visual identity before it reaches your
              audience.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={startHref} className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[15px] font-semibold text-paper transition hover:-translate-y-0.5">
                {signedIn ? "Open your workspace" : "Start protecting your brand"}
                <span className="transition group-hover:translate-x-0.5" aria-hidden>→</span>
              </Link>
              <a href="#product" className="inline-flex items-center gap-2 rounded-full border-2 border-ink px-6 py-3 text-[15px] font-semibold transition hover:bg-ink hover:text-paper">
                Explore the platform
              </a>
            </div>
            <p className="mt-4 text-sm text-ink-soft/80">
              {signedIn ? "You're signed in." : "One-click demo accounts for creator, reviewer and admin. No sign-up needed."}
            </p>
          </div>
          <HeroEditor />
        </div>
      </div>
      <div className="h-16 sm:h-24" />
    </Reveal>
  );
}

function HeroEditor() {
  return (
    <div className="reveal reveal-d2 relative mx-auto w-full max-w-[720px] lg:mr-0" aria-label="Illustration of the BrandGuard draft editor">
      <div className="clipping relative rounded-2xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3 text-sm">
          <span className="font-semibold">Exam season caption <span className="font-normal text-ink-soft">· Instagram · v1</span></span>
          <span className="kicker whitespace-nowrap rounded-full bg-proof/10 px-2 py-0.5 text-proof">4 open</span>
        </div>
        <div className="grid gap-0 sm:grid-cols-[minmax(0,1fr)_220px]">
          <p className="p-5 text-[15.5px] leading-[2.05] text-ink">
            Board exams are coming
            <mark className="rounded-sm bg-sky-200/80 px-0.5 text-inherit underline decoration-sky-600 decoration-2 underline-offset-4">!!!</mark> 📚 Lumio is{" "}
            <mark className="rounded-sm bg-proof/15 px-0.5 text-inherit underline decoration-proof decoration-2 underline-offset-4">India&apos;s top</mark> study app, and our flashcards{" "}
            <mark className="rounded-sm bg-proof/15 px-0.5 text-inherit underline decoration-proof decoration-2 underline-offset-4">guarantee</mark> better marks. Go all in with{" "}
            <mark className="rounded-sm bg-marker/80 px-0.5 text-inherit underline decoration-[#b08900] decoration-2 underline-offset-4">Lumio Premium</mark> for ₹199 a month.
          </p>
          <div className="grid content-start gap-2 border-t border-ink/10 p-4 sm:border-l sm:border-t-0">
            {[
              ["CLAIM-1", "high", "No unprovable superlatives", "a popular"],
              ["TERM-2", "medium", "Use “Lumio Plus”", "Lumio Plus"],
              ["CLAIM-2", "high", "No guaranteed results", "help you prepare for"],
            ].map(([code, sev, title, fix]) => (
              <div key={code} className="rounded-lg border border-ink/10 bg-paper/70 p-2.5">
                <div className="flex items-center justify-between">
                  <code className="text-[11px] font-bold">{code}</code>
                  <span className={`kicker text-[10px] ${sev === "high" ? "text-proof" : "text-[#8a6d00]"}`}>{sev}</span>
                </div>
                <p className="text-[12.5px] font-medium leading-tight">{title}</p>
                <p className="mt-1 text-[12px] text-approve">→ {fix}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="border-t border-ink/10 px-5 py-2 text-[11px] text-ink-soft/70">Illustration · fictional demo brand “Lumio”</p>
      </div>
      <div className="float-slow absolute -right-6 -top-28 z-10 hidden w-48 rotate-[5deg] bg-marker p-3 text-[13px] leading-snug shadow-lg [--r:5deg] xl:block">
        <span className="tape -top-3 left-12 bg-white/60" />
        <strong className="kicker block text-[10px]">Fact Vault</strong>
        Diwali offer expired on 5 Nov — flagged as out of date.
      </div>
      <span className="stamp stamp-animate absolute -bottom-7 right-4 bg-paper px-3 py-1 text-lg text-approve sm:text-xl">Human-approved</span>
      
    </div>
  );
}

function Marquee() {
  const words = ["Terminology", "Approved facts", "Claims", "Tone of voice", "Accessibility", "Visual identity", "Confidentiality", "Human approval"];
  const row = [...words, ...words];
  return (
    <div className="overflow-hidden border-y-2 border-ink bg-ink py-4 text-paper" aria-hidden>
      <div className="marquee-track flex gap-10 whitespace-nowrap">
        {row.map((w, i) => (
          <span key={i} className="display-tight flex items-center gap-10 text-3xl sm:text-4xl">
            {w} <span className="text-marker">✳</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

const PROBLEMS = [
  { tag: "Terminology", body: <><span className="strike-proof">Lumeo</span> · <span className="strike-proof">LUMIO</span> · <span className="strike-proof">Lumio app</span></>, note: "Three spellings of one name in a single week.", rot: "-2deg" },
  { tag: "Outdated facts", body: <>“40% off — <span className="strike-proof">this week only</span>”</>, note: "The offer ended on 5 November. The post went out on the 12th.", rot: "1.5deg" },
  { tag: "Unsupported claims", body: <>“Flashcards that <span className="strike-proof">guarantee</span> better marks”</>, note: "A promise legal never signed off.", rot: "-1deg" },
  { tag: "Tone of voice", body: <>“We <span className="strike-proof">hereby</span> welcome you”</>, note: "A friendly brand, written like a contract.", rot: "2deg" },
  { tag: "Off-brand visuals", body: <span className="flex items-center gap-2"><span className="inline-block h-6 w-6 rounded bg-[#ff2e93]" /> <code className="text-sm">#FF2E93</code> <span className="text-ink-soft">not in palette</span></span>, note: "Close to the brand colours, but not one of them.", rot: "-1.5deg" },
  { tag: "Accessibility", body: <>“<span className="strike-proof">Click here</span>” · contrast <strong className="text-proof">2.1 : 1</strong></>, note: "Unclear links and text that's hard to read.", rot: "1deg" },
  { tag: "Manual reviews", body: <>Same 40 rules. <span className="font-serif text-2xl italic">Every.</span> <span className="font-serif text-2xl italic">Single.</span> <span className="font-serif text-2xl italic">Post.</span></>, note: "Reviewers spend their time on spellings instead of judgement.", rot: "-0.5deg" },
];

function Problem() {
  return (
    <Reveal as="section" id="problem" className="relative bg-paper py-24 sm:py-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
          <p className="kicker reveal text-ink-soft">01 — The problem</p>
          <h2 className="reveal display-tight text-[clamp(2.6rem,6.4vw,6.2rem)]">
            Most brand mistakes aren&apos;t scandals. <span className="font-serif font-normal normal-case italic text-proof">They&apos;re small, repeated, and everywhere.</span>
          </h2>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PROBLEMS.map((p, i) => (
            <article
              key={p.tag}
              style={{ rotate: p.rot }}
              className={`clipping reveal relative rounded-md p-5 transition hover:rotate-0 hover:-translate-y-1 ${i === 6 ? "sm:col-span-2 bg-ink text-paper" : ""} reveal-d${(i % 3) + 1}`}
            >
              <span className="tape -top-3 left-1/2 -translate-x-1/2" />
              <p className={`kicker ${i === 6 ? "text-marker" : "text-proof"}`}>{p.tag}</p>
              <div className="mt-4 text-xl leading-snug">{p.body}</div>
              <p className={`mt-4 text-sm ${i === 6 ? "text-paper/70" : "text-ink-soft"}`}>{p.note}</p>
            </article>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

function Product() {
  return (
    <Reveal as="section" id="product" className="relative border-t-2 border-ink bg-paper-2 py-24 sm:py-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="mb-14 grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-end">
          <p className="kicker reveal text-ink-soft">02 — The product</p>
          <div>
            <h2 className="reveal display-wide text-[clamp(2.6rem,7vw,7rem)]">Draft to approved.</h2>
            <p className="reveal reveal-d1 mt-4 max-w-2xl text-lg text-ink-soft">
              Six steps, one screen. Keep scrolling to watch a scripted example move through them, or pick a step. To see real findings, sign in with a demo account and check a draft
              yourself.
            </p>
          </div>
        </div>
        {/* Not wrapped in .reveal: the demo uses position: sticky and must not sit inside a transformed box. */}
        <WorkflowDemo />
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------------- */

type Feature = { name: string; body: string; visual?: React.ReactNode };
const CHAPTERS: { no: string; title: React.ReactNode; dark?: boolean; items: Feature[] }[] = [
  {
    no: "A",
    title: <>Know your <em className="font-serif font-normal normal-case">brand</em></>,
    items: [
      { name: "Structured Brand Kit", body: "Rules with codes, categories, severities and optional exact patterns. Guideline PDFs can be imported; every extracted rule waits for an admin to approve it.", visual: <Chips items={["TONE-1", "CLAIM-2", "ACC-1", "VIS-1"]} /> },
      { name: "Approved terminology", body: "Preferred terms with the banned variants they replace. Case-only variants like LUMIO are matched exactly, so the correct spelling is never flagged.", visual: <p className="text-lg"><span className="strike-proof">Lumio Premium</span> → <strong>Lumio Plus</strong></p> },
      { name: "Fact Vault with expiry dates", body: "Prices, limits and offers with a valid-until date. Once a fact expires, using it as current is a finding.", visual: <p className="text-sm"><strong>FACT-6</strong> Diwali offer · <span className="rounded bg-proof px-1.5 py-0.5 text-[11px] font-bold uppercase text-white">expired 5 Nov</span></p> },
    ],
  },
  {
    no: "B",
    title: <>Check <em className="font-serif font-normal normal-case">everything</em></>,
    dark: true,
    items: [
      { name: "Intelligent text compliance", body: "Paste text or upload DOCX, PDF or TXT. Deterministic checks run first and keep working even if the AI is unavailable." },
      { name: "AI-powered findings", body: "Google Gemini reviews the draft against the whole kit and returns structured findings: quote, source code, explanation and fix." },
      { name: "Grounded recommendations", body: "A finding is kept only if it cites a real Brand Kit code and quotes words that are really in the draft. Everything else is discarded and counted." },
      { name: "Image & visual compliance", body: "PNG and JPG images: dominant colours measured against your palette, the nearest brand colour suggested, and logo usage compared with your logo files.", visual: <Swatches /> },
      { name: "Accessibility checks", body: "Text-on-image contrast measured with the WCAG 2.2 formula, missing or weak alt text with a suggested replacement, and vague link text." },
    ],
  },
  {
    no: "C",
    title: <>Private <em className="font-serif font-normal normal-case">and</em> measured</>,
    items: [
      { name: "Confidentiality masking", body: "Email addresses, phone numbers, Confidential Terms, unreleased products and your own patterns are swapped for placeholders before any text is sent to the AI, then restored for you.", visual: <p className="font-mono text-[13px]">priya@lumio.in → <span className="rounded bg-ink px-1 text-marker">[[EMAIL_1]]</span></p> },
      { name: "Accuracy measurement", body: "An evaluation set of 50+ posts with planted errors. A script reports precision, recall and the grounding-filter rejection rate, and the results are published in the repository." },
    ],
  },
  {
    no: "D",
    title: <>People <em className="font-serif font-normal normal-case">decide</em></>,
    items: [
      { name: "Human review & approval", body: "Creators accept, edit or dispute each finding. Only a reviewer or admin can approve, and nobody can approve their own draft." },
      { name: "Version history & audit trail", body: "Every edit is a new version, with word-level diffs and a timestamped log of who checked, fixed, disputed, approved or asked for changes." },
      { name: "Brand insights dashboard", body: "Most-broken rules, repeated terminology errors, disputes per rule, time to approval, and channel and creator trends, all computed from your own workspace data." },
    ],
  },
];

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <code key={c} className="rounded-md border border-current/20 px-2 py-0.5 text-[12px] font-bold">{c}</code>
      ))}
    </div>
  );
}
function Swatches() {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      {["#5568F2", "#0F172A", "#FFE14D"].map((c) => (
        <span key={c} className="h-7 w-7 rounded-full ring-2 ring-white/30" style={{ background: c }} title={c} />
      ))}
      <span className="mx-1 opacity-60">vs</span>
      <span className="h-7 w-7 rounded-full bg-[#FF2E93] ring-2 ring-proof" />
      <span className="opacity-70">ΔE 41 → nearest #5568F2</span>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="border-t-2 border-ink">
      <div className="bg-paper py-20 sm:py-24">
        <Reveal className="mx-auto grid max-w-[1400px] gap-6 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
          <p className="kicker reveal text-ink-soft">03 — Features</p>
          <h2 className="reveal display-wide text-[clamp(2.6rem,7vw,7rem)]">
            Thirteen ways <br className="hidden sm:block" />
            to stay <span className="font-serif font-normal normal-case italic"><span className="mark-sweep">on-brand.</span></span>
          </h2>
        </Reveal>
      </div>
      {CHAPTERS.map((ch) => (
        <Reveal
          as="div"
          key={ch.no}
          className={`border-t-2 border-ink py-16 sm:py-20 ${ch.dark ? "bg-ink text-paper" : "bg-paper"}`}
        >
          <div className="mx-auto grid max-w-[1400px] gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <span className={`display-wide block text-[clamp(5rem,12vw,10rem)] ${ch.dark ? "text-marker" : "text-proof"}`}>{ch.no}</span>
              <h3 className="display-tight reveal mt-2 text-[clamp(2.2rem,4.6vw,4.2rem)]">{ch.title}</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {ch.items.map((f, i) => (
                <article
                  key={f.name}
                  className={`reveal reveal-d${(i % 3) + 1} flex flex-col justify-between gap-6 rounded-2xl p-6 ${
                    ch.dark ? "border border-white/12 bg-white/[0.04]" : "clipping"
                  } ${ch.items.length % 2 === 1 && i === ch.items.length - 1 ? "sm:col-span-2" : ""}`}
                >
                  <div>
                    <h4 className="font-display text-xl font-bold [font-stretch:105%]">{f.name}</h4>
                    <p className={`mt-2 text-[15px] leading-relaxed ${ch.dark ? "text-paper/70" : "text-ink-soft"}`}>{f.body}</p>
                  </div>
                  {f.visual && <div>{f.visual}</div>}
                </article>
              ))}
            </div>
          </div>
        </Reveal>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------------- */

const ROLES = [
  {
    role: "Creators",
    colour: "text-marker",
    steps: ["Write, paste or upload a draft, and add images with alt text.", "Read each finding: the quote, the rule it breaks and why.", "Accept the fix, edit it, or dispute it with a reason.", "Send it for review once nothing is left open."],
  },
  {
    role: "Reviewers",
    colour: "text-[#9fb0ff]",
    steps: ["Open drafts from the review queue.", "See how each finding was resolved and read any disputes.", "Compare versions word by word in the Changes tab.", "Approve it, or request changes with a comment."],
  },
  {
    role: "Admins",
    colour: "text-[#ff9b85]",
    steps: ["Maintain rules, terms, facts, palette, logos and Confidential Terms.", "Import a guideline PDF and approve each extracted rule.", "Watch Insights for the most-broken and most-disputed rules.", "Edit a rule flagged “possibly unclear” in one click."],
  },
];

function Workflow() {
  return (
    <Reveal as="section" id="workflow" className="border-t-2 border-ink bg-ink py-24 text-paper sm:py-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <p className="kicker reveal text-paper/60">04 — How it works</p>
          <h2 className="reveal display-wide text-[clamp(2.6rem,7vw,7rem)]">
            Three roles. <span className="font-serif font-normal normal-case italic text-marker">One standard.</span>
          </h2>
        </div>
        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15 lg:grid-cols-3">
          {ROLES.map((r, ri) => (
            <div key={r.role} className={`reveal reveal-d${ri + 1} bg-ink p-7 sm:p-9`}>
              <h3 className={`display-tight text-5xl ${r.colour}`}>{r.role}</h3>
              <ol className="mt-8 grid gap-5">
                {r.steps.map((s, i) => (
                  <li key={i} className="grid grid-cols-[2.2rem_1fr] gap-2">
                    <span className="font-serif text-3xl italic leading-none text-paper/40">{i + 1}</span>
                    <span className="text-[15.5px] leading-relaxed text-paper/85">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------------- */

function Insights() {
  const bars = [
    ["CLAIM-1 · Superlatives", 92],
    ["TERM-2 · Lumio Plus", 74],
    ["MSG-1 · Facts match vault", 58],
    ["TONE-2 · Calm, never shouty", 41],
    ["ACC-1 · Link text", 33],
  ] as const;
  return (
    <Reveal as="section" id="insights" className="border-t-2 border-ink bg-paper py-24 sm:py-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <p className="kicker reveal text-ink-soft">05 — Brand intelligence</p>
          <div>
            <h2 className="reveal display-wide text-[clamp(2.6rem,7vw,7rem)]">See the pattern, fix the rule.</h2>
            <p className="reveal reveal-d1 mt-4 max-w-2xl text-lg text-ink-soft">
              The admin dashboard is computed live from your workspace&apos;s findings, disputes and approvals. Every number opens the drafts
              behind it.
            </p>
          </div>
        </div>

        <div className="reveal reveal-d2 relative mt-14">
          <span className="kicker absolute -top-3 left-6 z-10 rounded-full bg-proof px-3 py-1 text-white">Illustrative data</span>
          <div className="clipping grid gap-px overflow-hidden rounded-2xl bg-ink/10 md:grid-cols-6">
            <div className="bg-[#fffdf8] p-6 md:col-span-4">
              <p className="kicker text-ink-soft">Most-broken rules · last 8 weeks</p>
              <ul className="mt-5 grid gap-3">
                {bars.map(([label, v]) => (
                  <li key={label} className="grid grid-cols-[minmax(0,180px)_1fr_2.5rem] items-center gap-3 text-sm">
                    <span className="truncate font-medium">{label}</span>
                    <span className="h-3 rounded-full bg-ink/8">
                      <span className="block h-3 rounded-full bg-ink" style={{ width: `${v}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-ink-soft">{Math.round(v / 2)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#fffdf8] p-6 md:col-span-2">
              <p className="kicker text-ink-soft">Disputed guidelines</p>
              <p className="mt-4 font-display text-lg font-bold">TONE-2</p>
              <p className="text-sm text-ink-soft">48% of findings disputed</p>
              <span className="mt-3 inline-block rounded-full bg-marker px-3 py-1 text-xs font-bold uppercase tracking-wide">Possibly unclear</span>
              <p className="mt-3 text-sm underline decoration-proof decoration-2 underline-offset-4">Edit rule →</p>
            </div>
            <Metric label="Repeated terminology error" value="“Lumio Premium”" sub="in 11 drafts" />
            <Metric label="Median time to approval" value="6.4 h" sub="submission → approval" />
            <Metric label="Resolved before review" value="71%" sub="of findings" />
            <Metric label="Channel with most findings" value="Instagram" sub="per draft" />
            <Metric label="Creator trend" value="−38%" sub="repeat mistakes, wk 1 → 8" />
            <Metric label="Potentially unclear rules" value="2" sub="above dispute threshold" />
          </div>
        </div>
      </div>
    </Reveal>
  );
}
function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-[#fffdf8] p-5 md:col-span-1">
      <p className="kicker text-[10px] text-ink-soft">{label}</p>
      <p className="mt-3 font-display text-2xl font-bold leading-none [font-stretch:90%]">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{sub}</p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

const SECURITY = [
  ["Sensitive information masking", "Emails, phone numbers, Confidential Terms, unreleased product names and admin-defined patterns are replaced with per-request placeholders before any text reaches Gemini, then restored in the quotes and fixes you see."],
  ["Workspace isolation", "Every table carries a workspace id. Postgres row-level security only returns rows from your own workspace, including the analytics views."],
  ["Role-based access", "Creators, reviewers and admins have different rights, enforced in the database as well as in the UI. Only admins can change the Brand Kit."],
  ["Row-level security", "RLS is switched on for every table and storage bucket. The service-role key and the Gemini key stay on the server and never reach the browser."],
  ["AI data handling", "AI calls are made server-side. Draft text is treated as untrusted data, never as instructions. Masking applies to text. Images are sent to the vision model as they are, so don't upload images that contain secrets."],
  ["Human approval", "AI output is only ever a suggestion. A person accepts or disputes every finding, and only a reviewer can approve."],
  ["Audit history", "Checks, fixes, disputes, comments and decisions are logged with who did what, on which version and when."],
];

function Security() {
  return (
    <Reveal as="section" id="security" className="border-t-2 border-ink bg-paper-2 py-24 sm:py-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="kicker reveal text-ink-soft">06 — Security & trust</p>
            <h2 className="reveal display-wide mt-6 text-[clamp(2.6rem,6vw,6rem)]">Trust, <br />by design.</h2>
            <p className="reveal reveal-d1 mt-6 max-w-sm text-ink-soft">
              This section only describes safeguards that exist in the code. The details are in the{" "}
              <Link href="/ai-disclosure" className="font-semibold underline decoration-proof decoration-2 underline-offset-4">AI disclosure</Link>.
            </p>
          </div>
          <ol className="divide-y-2 divide-ink border-y-2 border-ink">
            {SECURITY.map(([t, d], i) => (
              <li key={t} className={`reveal reveal-d${(i % 3) + 1} grid gap-3 py-6 sm:grid-cols-[3rem_minmax(0,220px)_1fr] sm:gap-6`}>
                <span className="font-serif text-3xl italic text-proof">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-display text-xl font-bold leading-tight [font-stretch:105%]">{t}</h3>
                <p className="text-[15px] leading-relaxed text-ink-soft">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Reveal>
  );
}

function About() {
  return (
    <Reveal as="section" id="about" className="border-t-2 border-ink bg-paper py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
        <p className="kicker reveal text-ink-soft">07 — About</p>
        <div>
          <p className="reveal font-serif text-[clamp(1.8rem,3.6vw,3.2rem)] leading-[1.12]">
            BrandGuard is a pre-publication checkpoint. It doesn&apos;t write your content and it doesn&apos;t publish it. It reads every draft the
            way your most careful editor would, <span className="mark-sweep">shows its sources,</span> and leaves the decision to people.
          </p>
          <dl className="reveal reveal-d1 mt-12 grid gap-6 border-t-2 border-ink pt-8 sm:grid-cols-3">
            <div>
              <dt className="kicker text-ink-soft">Built by</dt>
              <dd className="mt-2 font-display text-lg font-bold">Team 404 · Priyanka Wanjari</dd>
            </div>
            <div>
              <dt className="kicker text-ink-soft">Built for</dt>
              <dd className="mt-2 font-display text-lg font-bold">CodeNova hackathon (We Code Coders), brief by Inkloom AI</dd>
            </div>
            <div>
              <dt className="kicker text-ink-soft">Demo brand</dt>
              <dd className="mt-2 font-display text-lg font-bold">“Lumio”, a fictional study app</dd>
            </div>
          </dl>
        </div>
      </div>
    </Reveal>
  );
}

function FinalCta({ startHref, signedIn }: { startHref: string; signedIn: boolean }) {
  return (
    <Reveal as="section" className="relative overflow-hidden border-t-2 border-ink bg-marker py-24 sm:py-36">
      <div className="mx-auto max-w-[1400px] px-5 text-center sm:px-8">
        <h2 className="reveal display-wide text-[clamp(3rem,10vw,10rem)]">
          Make it <span className="font-serif font-normal normal-case italic">sound like</span> you.
        </h2>
        <p className="reveal reveal-d1 mx-auto mt-6 max-w-xl text-lg">
          Bring your guidelines, terms and facts. BrandGuard checks every draft against them, and your team makes the final call.
        </p>
        <div className="reveal reveal-d2 mt-10 flex flex-wrap justify-center gap-3">
          <Link href={startHref} className="rounded-full bg-ink px-7 py-4 text-base font-semibold text-paper transition hover:-translate-y-0.5">
            {signedIn ? "Open your workspace →" : "Start protecting your brand →"}
          </Link>
          <a href="#product" className="rounded-full border-2 border-ink px-7 py-3.5 text-base font-semibold transition hover:bg-ink hover:text-marker">
            See the walkthrough
          </a>
        </div>
      </div>
    </Reveal>
  );
}

function Footer() {
  return (
    <footer className="bg-ink pb-10 pt-16 text-paper">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo className="text-xl text-paper [&_svg_path:first-child]:text-marker [&_svg_path:last-child]:stroke-ink" />
            <p className="mt-4 max-w-xs text-sm text-paper/60">Pre-publication brand checks with cited findings, suggested fixes and human approval.</p>
          </div>
          <FooterCol title="Navigate" links={NAV_ITEMS.map((n) => [n.label, n.href])} />
          <FooterCol title="Product" links={[["Sign in", "/login"], ["Workflow demo", "#product"], ["Brand intelligence", "#insights"], ["Problem", "#problem"]]} />
          <FooterCol title="Documentation" links={[["README & setup", `${REPO}#readme`], ["Source code", REPO], ["AI disclosure", "/ai-disclosure"]]} />
        </div>
        <div className="mt-16 flex flex-wrap items-end justify-between gap-4 border-t border-white/15 pt-6">
          <span className="display-wide text-[clamp(3rem,12vw,9rem)] text-paper/10" aria-hidden>BrandGuard</span>
          <p className="text-xs text-paper/50">Team 404 · CodeNova final round · Demo content uses a fictional brand.</p>
        </div>
      </div>
    </footer>
  );
}
function FooterCol({ title, links }: { title: string; links: string[][] }) {
  return (
    <div>
      <p className="kicker text-paper/50">{title}</p>
      <ul className="mt-4 grid gap-2 text-sm">
        {links.map(([l, h]) => (
          <li key={l}>
            {h.startsWith("http") ? (
              <a href={h} className="text-paper/80 hover:text-marker" rel="noreferrer" target="_blank">{l}</a>
            ) : h.startsWith("#") ? (
              <a href={h} className="text-paper/80 hover:text-marker">{l}</a>
            ) : (
              <Link href={h} className="text-paper/80 hover:text-marker">{l}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
