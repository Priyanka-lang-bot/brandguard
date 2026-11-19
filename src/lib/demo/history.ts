/**
 * Clearly identified demo history for the insights dashboard. Every draft created from this file is stored
 * with drafts.demo_seed = true and the dashboard labels it. Findings come from running the real rule checks
 * on these texts; only the creators' decisions (accept / dispute) and the timestamps are scripted.
 */

export interface HistoryTemplate {
  title: string;
  channel: string;
  purpose: string;
  content: string;
}

export const HISTORY_TEMPLATES: HistoryTemplate[] = [
  { title: "Board exam countdown", channel: "Instagram", purpose: "Drive free sign-ups before boards.", content: "Only 30 days to boards!!! Lumio is the best way to revise, and Lumio Premium unlocks every chapter. Click here to start." },
  { title: "Flashcards tip thread", channel: "X / Twitter", purpose: "Share a study tip.", content: "Flash cards work best in short bursts!! Our users revise 10 cards a day. Click here for the full guide." },
  { title: "Welcome series #2", channel: "Email", purpose: "Second onboarding email.", content: "We hereby remind you to utilise your study plans. Login to Lumio Premium any time from your e-mail link." },
  { title: "Parents' newsletter", channel: "Email", purpose: "Reassure parents about safety.", content: "Lumio is 100% secure and completely secure for kids. Our users trust us, and results are guaranteed." },
  { title: "Results week post", channel: "LinkedIn", purpose: "Celebrate learners' results.", content: "Congratulations to every learner!! Lumio is India's top study app and the best partner for exam season." },
  { title: "Offline mode reel caption", channel: "Instagram", purpose: "Promote offline mode.", content: "Study anywhere!!! Lumeo works offline, so log-in once and revise with flash cards on the go." },
  { title: "Pricing FAQ update", channel: "Website", purpose: "Answer plan questions.", content: "Lumio Pro gives you unlimited flash cards. Users can leverage synergies across subjects." },
  { title: "Teacher outreach", channel: "Email", purpose: "Invite teachers to try Lumio.", content: "Pursuant to our chat, we hereby invite you to try Lumio. Click here to book a call." },
  { title: "Weekend challenge", channel: "Instagram", purpose: "Engagement post.", content: "Weekend challenge!! Make 20 flashcards and share them. The best entries win Lumio Plus for a month." },
  { title: "Exam stress blog", channel: "Blog", purpose: "Helpful article on exam stress.", content: "Exam stress is insane right now. Lumio helps you plan your week so revision feels calmer. Read more below." },
  { title: "Referral push", channel: "X / Twitter", purpose: "Promote referrals.", content: "Invite a friend to LUMIO and you both get a week of Lumio Premium!! Click here." },
  { title: "Study plan launch note", channel: "LinkedIn", purpose: "Announce study-plan improvements.", content: "Study plans just got smarter. Lumio is the best study planner and our users love the new view." },
];

/** Small deterministic PRNG so the demo history is identical on every reset. */
export function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Scripted creator decisions per rule code. TONE-2 is disputed often, so it is flagged "possibly unclear". */
export const DISPUTE_PROBABILITY: Record<string, number> = { "TONE-2": 0.65, "CLAIM-1": 0.15, "ACC-1": 0.25, "ACC-3": 0.3 };
export const DISPUTE_REASONS: Record<string, string> = {
  "TONE-2": "Celebration posts on Instagram need a bit of energy; one '!!' isn't shouting.",
  "CLAIM-1": "This is a contest phrase ('best entries'), not a claim about Lumio.",
  "ACC-1": "The button text is set by the platform; we can't change it.",
  "ACC-3": "Used as slang in a student voice, not about disability.",
};
