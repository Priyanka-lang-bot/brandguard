/**
 * Sample drafts for the demo workspace. Every draft created from this file is stored with drafts.demo_seed = true
 * and shown with a "Sample" tag in the app. Lumio is a fictional brand; nothing here describes a real company,
 * customer or result.
 *
 * Findings are produced by running the real rule checks on `content`. The only scripted parts are:
 *  - the people's decisions (accept / edit / dispute, submit, approve, request changes) and timestamps, and
 *  - `factFindings`: Fact Vault mismatches that the AI pass would normally find. The seed runs without the AI,
 *    so these are stored with engine = "demo" and the app labels them "sample finding".
 */
import { DEMO_DRAFTS } from "../demo-kit";

export type Outcome = "unchecked" | "analysed" | "in_review" | "changes_requested" | "approved";
export type Decision = { status: "accepted" | "edited" | "disputed"; text?: string; reason?: string };

export interface ShowcaseDraft {
  key: string;
  title: string;
  channel: string;
  purpose: string;
  author: "creator" | "creator2";
  /** Days before the seed run that the draft was created. */
  daysAgo: number;
  content: string;
  outcome: Outcome;
  /** Decisions keyed by the flagged text (case-insensitive). Unlisted findings take the suggested fix. */
  decisions?: Record<string, Decision>;
  /** For "analysed": resolve only the first N findings and leave the rest open. */
  resolveFirst?: number;
  factFindings?: { quote: string; factCode: string; explanation: string; suggestion: string }[];
  image?: "exam-poster" | "launch-poster";
  /** Hours from creation to submission, and from submission to the reviewer's decision. */
  submitAfterHours?: number;
  decideAfterHours?: number;
  /** The reviewer's comment with their decision, and any extra comments on the thread. */
  decisionNote?: string;
  comments?: { by: "author" | "reviewer"; text: string; afterHours: number }[];
}

/** Additions to the demo Brand Kit used by the launch-campaign samples. Added only if missing. */
export const SHOWCASE_TERMS = [
  { preferred: "Lumio for Schools", banned: ["Lumio Schools", "Lumio for School"], note: "Product name for the classroom plan (sample)." },
];
export const SHOWCASE_FACTS = [
  { code: "FACT-8", topic: "Lumio for Schools launch", statement: "Lumio for Schools launches on 8 December 2026 for classes 9–12.", valid_until: "2027-06-30" },
];

const [examCaption, welcomeEmail] = DEMO_DRAFTS;

export const SHOWCASE: ShowcaseDraft[] = [
  // ------------------------------------------------------------------ Kabir (creator)
  {
    key: "welcome-email",
    title: welcomeEmail.title,
    channel: welcomeEmail.channel,
    purpose: welcomeEmail.purpose,
    author: "creator",
    daysAgo: 2,
    content: welcomeEmail.content,
    outcome: "analysed",
    factFindings: [
      {
        quote: "Coming next month: Lumio Live",
        factCode: "FACT-4",
        explanation: "The Fact Vault says Lumio Live has not launched and has no announced release date.",
        suggestion: "Coming soon: Lumio Live",
      },
      {
        quote: "study offline on any phone, Android or iPhone",
        factCode: "FACT-5",
        explanation: "Offline mode is available on Android only; iOS support has no date yet.",
        suggestion: "study offline on Android",
      },
    ],
  },
  {
    key: "exam-poster",
    title: "Exam season poster",
    channel: "Instagram",
    purpose: "Announce Lumio Plus with a poster.",
    author: "creator",
    daysAgo: 1,
    content: "Lumio Plus is here for exam season. Swipe to see what's included.",
    outcome: "analysed",
    image: "exam-poster",
  },
  {
    key: "homepage-hero",
    title: "Homepage hero refresh",
    channel: "Website",
    purpose: "New headline and supporting copy for the homepage.",
    author: "creator",
    daysAgo: 4,
    content:
      "Lumio is the best study app for classes 9–12.\n\nBuild a study plan in minutes, revise with flash cards and track every chapter. Login to Lumio Premium to unlock unlimited study plans.\n\nRead more",
    outcome: "analysed",
    resolveFirst: 2,
    decisions: { "the best": { status: "edited", text: "a calm" } },
  },
  {
    key: "study-tips-newsletter",
    title: "Study tips newsletter — November",
    channel: "Email",
    purpose: "Monthly tips email for active learners.",
    author: "creator",
    daysAgo: 5,
    content:
      "Subject: Five calm ways to revise this month\n\nHi there,\n\nNovember is busy, so here are five small habits that help. Short sessions beat long ones. Mix subjects across the week. Test yourself with flashcards before you reread your notes. Sleep matters more than one extra hour. Plan a lighter day before each exam.\n\nOpen your study plan in Lumio to try one today.\n\nTeam Lumio",
    outcome: "analysed",
  },
  {
    key: "webinar-notes",
    title: "December webinar invite (notes)",
    channel: "Email",
    purpose: "Invite learners to a live revision webinar. Rough notes, not checked yet.",
    author: "creator",
    daysAgo: 0,
    content:
      "Subject: Join our December revision webinar\n\nNotes: date and time to confirm with the events team. Speakers: two Lumio tutors. Topics: making a two-week revision plan, using flashcards for formulas.\n\nRegister using the link below.",
    outcome: "unchecked",
  },
  {
    key: "schools-launch-email",
    title: "Lumio for Schools — launch email",
    channel: "Email",
    purpose: "Product launch campaign: announce Lumio for Schools to teachers.",
    author: "creator",
    daysAgo: 6,
    content:
      "Subject: Lumio for Schools is here!!\n\nDear teachers,\n\nWe hereby announce Lumio for Schools, the number one way to run revision for a whole class. Teachers can assign flash cards, see who is falling behind and share study plans with every student. Over 500,000 users already trust Lumio.\n\nLumio for Schools launches on 1 December for classes 9–12.\n\nClick here to book a demo.\n\nTeam Lumio",
    outcome: "changes_requested",
    decisions: {
      "over 500,000 users": { status: "disputed", reason: "This number is from the sales deck, so I kept it." },
      "click here": { status: "edited", text: "Use this link" },
      "number one": { status: "edited", text: "simplest" },
      hereby: { status: "edited", text: "are happy to" },
    },
    factFindings: [
      {
        quote: "Over 500,000 users",
        factCode: "FACT-3",
        explanation: "The Fact Vault says Lumio has over 120,000 learners (October 2026).",
        suggestion: "Over 120,000 learners",
      },
      {
        quote: "1 December",
        factCode: "FACT-8",
        explanation: "The approved launch date for Lumio for Schools is 8 December 2026.",
        suggestion: "8 December",
      },
    ],
    submitAfterHours: 5,
    decideAfterHours: 20,
    decisionNote: "The learner count still doesn't match FACT-3 (over 120,000 learners). Please use the Fact Vault number; the sales deck figure isn't approved for external copy.",
  },
  {
    key: "schools-landing-page",
    title: "Lumio for Schools — landing page",
    channel: "Website",
    purpose: "Product launch campaign: landing page for school sign-ups.",
    author: "creator",
    daysAgo: 3,
    content:
      "Lumio for Schools\n\nOne place for your class to plan, revise and check progress. Assign flashcards in seconds, see which chapters need attention and share study plans with the whole class.\n\nLumio encrypts data in transit and at rest and never sells learner data, so your school's information is 100% secure.\n\nLaunching 8 December for classes 9–12. Click here to book a walkthrough.",
    outcome: "in_review",
    decisions: {
      "100% secure": { status: "edited", text: "protected" },
      "click here": { status: "edited", text: "Use the form below" },
    },
    submitAfterHours: 26,
  },
  {
    key: "schools-launch-poster",
    title: "Lumio for Schools launch poster",
    channel: "Instagram",
    purpose: "Product launch campaign: promotional poster for the launch week.",
    author: "creator",
    daysAgo: 2,
    content: "Lumio for Schools launches 8 December. Classes 9–12, one shared study plan.",
    outcome: "in_review",
    image: "launch-poster",
    submitAfterHours: 3,
  },
  {
    key: "exam-caption",
    title: examCaption.title,
    channel: examCaption.channel,
    purpose: examCaption.purpose,
    author: "creator",
    daysAgo: 3,
    content: examCaption.content,
    outcome: "in_review",
    decisions: {
      "india's top": { status: "edited", text: "a popular" },
      guarantee: { status: "edited", text: "help you aim for" },
      "click here": { status: "edited", text: "Tap the link in our bio" },
      "!!!": { status: "disputed", reason: "Exam-season posts are allowed a little hype on Instagram; this is a one-off." },
    },
    submitAfterHours: 30,
  },
  {
    key: "back-to-school-email",
    title: "Back-to-school checklist",
    channel: "Email",
    purpose: "Start-of-term checklist email.",
    author: "creator",
    daysAgo: 30,
    content:
      "Subject: Your start-of-term checklist\n\nHi there,\n\nA new term is a good time to reset. Here's a short checklist: pick your subjects, make one study plan per subject, and add 20 flashcards for the first chapter. Utilise the weekly view to see what's coming up.\n\nTeam Lumio",
    outcome: "approved",
    submitAfterHours: 2,
    decideAfterHours: 6,
    decisionNote: "Clear and friendly. Approved.",
  },
  {
    key: "webinar-recap",
    title: "Teacher webinar recap",
    channel: "LinkedIn",
    purpose: "Thank teachers who joined the webinar and share the recording.",
    author: "creator",
    daysAgo: 12,
    content:
      "Thank you to the 40 teachers who joined our revision-planning webinar on Saturday!! The recording and slides are now on our website, and we'd love your feedback on what to cover next.",
    outcome: "approved",
    submitAfterHours: 1,
    decideAfterHours: 4,
    decisionNote: "Approved — nice and warm.",
  },
  // ------------------------------------------------------------------ Meera (second creator)
  {
    key: "schools-linkedin",
    title: "Lumio for Schools — LinkedIn announcement",
    channel: "LinkedIn",
    purpose: "Product launch campaign: open the Lumio for Schools waitlist.",
    author: "creator2",
    daysAgo: 1,
    content:
      "We're live!! Today we're opening the waitlist for Lumio for Schools: shared study plans, class-wide flashcards and progress views for teachers.\n\nLumio is India's leading study app, and schools asked us for this more than anything else.\n\nJoin the waitlist through the link in our profile.",
    outcome: "in_review",
    decisions: {
      "india's leading": { status: "edited", text: "a growing" },
      "!!": { status: "disputed", reason: "Launch-day post on LinkedIn; one double exclamation is intentional." },
    },
    submitAfterHours: 4,
    comments: [{ by: "author", text: "Timed for the launch-day slot, so a quick look would be great.", afterHours: 4.1 }],
  },
  {
    key: "parents-faq",
    title: "Parents' FAQ: data and safety",
    channel: "Website",
    purpose: "Answer parents' most common questions about safety and offline use.",
    author: "creator2",
    daysAgo: 2,
    content:
      "Is Lumio safe for my child?\n\nYes. Lumio is completely secure and unhackable. We encrypt data in transit and at rest and never sell learner data.\n\nCan my child use Lumio offline?\n\nYes, offline mode works on Android and iPhone.",
    outcome: "in_review",
    decisions: {
      "completely secure": { status: "edited", text: "carefully protected" },
      unhackable: { status: "edited", text: "monitored around the clock" },
    },
    factFindings: [
      {
        quote: "Android and iPhone",
        factCode: "FACT-5",
        explanation: "Offline mode is available on Android only; iOS support is planned with no date.",
        suggestion: "Android (iPhone support is planned)",
      },
    ],
    submitAfterHours: 8,
  },
  {
    key: "referral-post",
    title: "Referral programme post",
    channel: "X / Twitter",
    purpose: "Remind learners about referrals.",
    author: "creator2",
    daysAgo: 1,
    content: "Invite a friend to Lumio and you both get a week of Lumio Plus. Share your invite link from the Invite tab in the app.",
    outcome: "in_review",
    submitAfterHours: 1,
  },
  {
    key: "diwali-banner",
    title: "Diwali offer banner copy",
    channel: "Website",
    purpose: "Banner for the festive offer.",
    author: "creator2",
    daysAgo: 10,
    content: "Diwali offer: 40% off Lumio Plus for your first year. Offer ends Sunday.",
    outcome: "changes_requested",
    factFindings: [
      {
        quote: "Diwali offer: 40% off Lumio Plus",
        factCode: "FACT-6",
        explanation: "FACT-6 (the Diwali offer) expired on 5 November 2026, so the offer can't be promoted now.",
        suggestion: "Lumio Plus: ₹199 a month or ₹1,999 a year",
      },
    ],
    decisions: { "diwali offer: 40% off lumio plus": { status: "disputed", reason: "Marketing wants to run it one more week." } },
    submitAfterHours: 2,
    decideAfterHours: 9,
    decisionNote: "The Diwali offer ended on 5 November (FACT-6). Please switch to current pricing from FACT-1 or wait for a new approved offer.",
  },
  {
    key: "offline-blog",
    title: "Offline mode explainer",
    channel: "Blog",
    purpose: "Short explainer on offline mode.",
    author: "creator2",
    daysAgo: 20,
    content:
      "Exam weeks can feel insane. Offline mode on Android lets you revise flashcards on the bus, in a power cut or anywhere the signal drops. Download a deck once and it stays on your phone until you remove it.",
    outcome: "approved",
    decisions: { insane: { status: "disputed", reason: "It's a student's own words from a feedback call." } },
    submitAfterHours: 3,
    decideAfterHours: 28,
    decisionNote: "Approving. Next time I'd pick 'hectic' over 'insane'.",
  },
  {
    key: "results-thanks",
    title: "Results day thank-you",
    channel: "Instagram",
    purpose: "Thank learners after results.",
    author: "creator2",
    daysAgo: 6,
    content: "Results are out. Whatever your marks, we're proud of how hard you worked this term. Thank you for revising with Lumio.",
    outcome: "approved",
    submitAfterHours: 1,
    decideAfterHours: 3,
    decisionNote: "Approved.",
  },
];
