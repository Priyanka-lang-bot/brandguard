// Demo Brand Kit for "Lumio", a fictional study app. Used by the seed script and the demo reset.

export const DEMO_WORKSPACE = "Lumio (demo brand)";

export const DEMO_USERS = [
  { email: "admin@brandguard.demo", full_name: "Asha Admin", role: "admin" as const },
  { email: "creator@brandguard.demo", full_name: "Kabir Creator", role: "creator" as const },
  { email: "reviewer@brandguard.demo", full_name: "Riya Reviewer", role: "reviewer" as const },
];
export const DEMO_PASSWORD = "brandguard-demo";

export const DEMO_RULES = [
  {
    code: "TONE-1",
    category: "tone",
    title: "Friendly, plain language",
    description:
      "Write like a helpful senior student: short sentences, everyday words. Avoid corporate or legal jargon such as 'hereby', 'utilise', 'leverage', 'synergy' or 'pursuant to'.",
    severity: "medium",
    patterns: ["\\b(hereby|pursuant to|synerg(y|ies))\\b", "\\butili[sz](e|es|ed|ing)\\b => use", "\\bleverag(e|es|ed|ing)\\b => use"],
  },
  {
    code: "TONE-2",
    category: "tone",
    title: "Calm, never shouty",
    description: "No runs of exclamation marks and no ALL-CAPS words for emphasis. One exclamation mark per piece at most.",
    severity: "low",
    patterns: ["!{2,} => !"],
  },
  {
    code: "TONE-3",
    category: "tone",
    title: "Talk to the learner",
    description: "Address the reader as 'you' and speak as 'we'. Do not refer to readers in the third person ('students should…') in learner-facing copy.",
    severity: "low",
    patterns: [],
  },
  {
    code: "CLAIM-1",
    category: "claims",
    title: "No unprovable superlatives",
    description:
      "Do not call Lumio the best, #1, number one, world-class or India's top/leading app. We have no independent ranking that supports it.",
    severity: "high",
    patterns: ["#\\s?1\\b", "\\bnumber one\\b", "\\bworld[- ]class\\b", "\\bindia'?s (top|leading|best)\\b", "\\bthe best\\b"],
  },
  {
    code: "CLAIM-2",
    category: "claims",
    title: "No guaranteed results",
    description: "Never promise marks, ranks, admissions or results. Say Lumio helps learners prepare, not that it guarantees an outcome.",
    severity: "high",
    patterns: ["\\bguarantee(s|d)?\\b", "\\b100% (success|results|pass)\\b"],
  },
  {
    code: "CLAIM-3",
    category: "claims",
    title: "No absolute security claims",
    description: "Do not say Lumio is 100% safe, completely secure or unhackable. Describe what we do (encryption, no data selling) instead.",
    severity: "high",
    patterns: ["\\b100% (safe|secure)\\b", "\\bunhackable\\b", "\\bcompletely secure\\b"],
  },
  {
    code: "MSG-1",
    category: "messaging",
    title: "Prices, plans and numbers match the Fact Vault",
    description: "Any price, plan limit, learner count, platform availability or date must match an approved, unexpired fact.",
    severity: "high",
    patterns: [],
  },
  {
    code: "MSG-2",
    category: "messaging",
    title: "Don't announce unreleased features",
    description: "Do not present features that have not launched as available, and do not give release dates that are not in the Fact Vault.",
    severity: "high",
    patterns: [],
  },
  {
    code: "ACC-1",
    category: "accessibility",
    title: "Descriptive link text",
    description: "Link text must say where it goes. Avoid 'click here' or 'read more' on their own.",
    severity: "medium",
    patterns: ["\\bclick here\\b"],
  },
  {
    code: "ACC-2",
    category: "accessibility",
    title: "Images need alt text",
    description: "Every image in the content needs alternative text that describes it. In Markdown, ![](image.png) has no alt text.",
    severity: "medium",
    patterns: ["!\\[\\s*\\]\\([^)]*\\)"],
  },
  {
    code: "ACC-3",
    category: "accessibility",
    title: "Inclusive language",
    description: "Avoid ableist idioms such as 'crazy', 'insane', 'lame' or 'blind to'. Pick a precise word instead.",
    severity: "low",
    patterns: ["\\b(crazy|insane|lame)\\b"],
  },
] as const;

export const DEMO_TERMS = [
  { preferred: "Lumio", banned: ["Lumeo", "LumIO", "LUMIO", "Lumio app"], note: "Our name is always written 'Lumio'." },
  { preferred: "Lumio Plus", banned: ["Lumio Premium", "Premium plan", "Lumio Pro"], note: "'Premium' was retired in 2025; the paid plan is Lumio Plus." },
  { preferred: "flashcards", banned: ["flash cards", "flash-cards"], note: "One word." },
  { preferred: "sign in", banned: ["login to", "log-in", "signin"], note: "Use 'sign in' / 'sign up' in all copy." },
  { preferred: "email", banned: ["e-mail", "E-mail"], note: "No hyphen." },
  { preferred: "learners", banned: ["users"], note: "We call the people who use Lumio learners." },
];

export const DEMO_FACTS = [
  { code: "FACT-1", topic: "Lumio Plus price", statement: "Lumio Plus costs ₹199 per month or ₹1,999 per year.", valid_until: "2027-03-31" },
  { code: "FACT-2", topic: "Free plan limits", statement: "The free plan includes up to 3 study plans and 200 flashcards.", valid_until: null },
  { code: "FACT-3", topic: "Learner count", statement: "Lumio has over 120,000 learners (October 2026).", valid_until: "2026-12-31" },
  { code: "FACT-4", topic: "Lumio Live tutoring", statement: "Lumio Live (1:1 tutoring) has not launched and has no announced release date.", valid_until: null },
  { code: "FACT-5", topic: "Offline mode", statement: "Offline mode is available on Android only. iOS support is planned with no date.", valid_until: null },
  { code: "FACT-6", topic: "Diwali offer", statement: "Diwali offer: 40% off the first year of Lumio Plus.", valid_until: "2026-11-05" },
  { code: "FACT-7", topic: "Data practices", statement: "Lumio encrypts data in transit and at rest and never sells learner data.", valid_until: null },
];

export const DEMO_DRAFTS = [
  {
    title: "Exam season Instagram caption",
    channel: "Instagram",
    purpose: "Get students preparing for board exams to try the free plan.",
    status: "in_review" as const,
    content: `Board exams are coming!!! 📚

Lumio is India's top study app, and our smart flashcards guarantee better marks. Start free today, or go all in with Lumio Premium for ₹199 a month.

Our users love it. Click here to get started.`,
  },
  {
    title: "Welcome email for new learners",
    channel: "Email",
    purpose: "Welcome new sign-ups and show them the first three things to try.",
    status: "draft" as const,
    content: `Subject: Welcome to Lumio 👋

Hi there,

We hereby welcome you to LUMIO! You can now utilise smart flash cards, build study plans and study offline on any phone, Android or iPhone.

Coming next month: Lumio Live, 1:1 tutoring with toppers. Our app is 100% secure, so your notes are always safe.

Don't miss our Diwali offer — 40% off Lumio Plus this week only.

![](welcome-banner.png)

See you inside,
Team Lumio`,
  },
];
