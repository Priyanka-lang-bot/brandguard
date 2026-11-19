"""Authoring source for eval/dataset.json (run: python3 eval/build_dataset.py).
Each post plants known Brand Kit violations for the demo brand "Lumio". An expected finding is
(accepted source codes, exact quote, category). A finding matches if it cites one of the codes and
its span overlaps the quote. Clean posts (no expected findings) measure false positives."""
import json

P = []
def post(channel, text, *expected):
    P.append({"id": f"P{len(P)+1:02d}", "channel": channel, "content": text,
              "expected": [{"codes": c if isinstance(c, list) else [c], "quote": q, "category": cat} for c, q, cat in expected]})

FACT_PRICE = ["FACT-1", "MSG-1"]
# --- Terminology & product names -------------------------------------------------
post("Instagram", "Lumeo makes revision feel lighter. Try a study plan tonight.", ("TERM-1", "Lumeo", "product_name"))
post("LinkedIn", "Our team at LumIO is hiring a content designer.", ("TERM-1", "LumIO", "product_name"))
post("Email", "Your Lumio Premium plan renews next month.", ("TERM-2", "Lumio Premium", "product_name"))
post("Website", "Upgrade to Lumio Pro to unlock every subject.", ("TERM-2", "Lumio Pro", "product_name"))
post("Blog", "Make ten flash cards for each chapter and test yourself.", ("TERM-3", "flash cards", "terminology"))
post("Instagram", "Pro tip: colour-code your flash-cards by subject.", ("TERM-3", "flash-cards", "terminology"))
post("Email", "Login to your account to see this week's plan.", ("TERM-4", "Login to", "terminology"))
post("Website", "Forgot your password? Use the log-in page to reset it.", ("TERM-4", "log-in", "terminology"))
post("Email", "We'll send your weekly summary by e-mail every Sunday.", ("TERM-5", "e-mail", "terminology"))
post("Blog", "Thousands of users revise with Lumio every evening.", ("TERM-6", "users", "terminology"))
post("Instagram", "The Lumio app now has a dark theme.", ("TERM-1", "Lumio app", "product_name"))
post("X / Twitter", "LUMIO turns your notes into a plan.", ("TERM-1", "LUMIO", "product_name"))
# --- Prices, plan limits and outdated facts ----------------------------------------
post("Website", "Lumio Plus costs ₹149 a month.", (FACT_PRICE, "₹149 a month", "facts_prices"))
post("Instagram", "Get Lumio Plus for just ₹1,499 a year.", (FACT_PRICE, "₹1,499 a year", "facts_prices"))
post("Blog", "The free plan includes 5 study plans and 200 flashcards.", (["FACT-2", "MSG-1"], "5 study plans", "facts_prices"))
post("Email", "On the free plan you get unlimited flashcards.", (["FACT-2", "MSG-1"], "unlimited flashcards", "facts_prices"))
post("LinkedIn", "More than 2 lakh learners study with Lumio.", (["FACT-3", "MSG-1"], "More than 2 lakh learners", "facts_prices"))
post("Instagram", "Diwali offer: 40% off Lumio Plus, this week only.", (["FACT-6", "MSG-1"], "Diwali offer: 40% off Lumio Plus, this week only", "outdated_fact"))
post("Website", "Offline mode works on Android and iPhone.", (["FACT-5", "MSG-1", "MSG-2"], "Android and iPhone", "facts_prices"))
post("Email", "Download Lumio on iOS and study offline on the bus.", (["FACT-5", "MSG-1", "MSG-2"], "study offline", "facts_prices"))
post("Blog", "Lumio Plus is ₹199 per month, or ₹2,199 per year.", (FACT_PRICE, "₹2,199 per year", "facts_prices"))
post("X / Twitter", "Still time to grab the Diwali deal on Lumio Plus.", (["FACT-6", "MSG-1"], "grab the Diwali deal", "outdated_fact"))
# --- Unreleased features -------------------------------------------------------------
post("Instagram", "Lumio Live, our 1:1 tutoring, launches next month.", (["MSG-2", "FACT-4"], "Lumio Live, our 1:1 tutoring, launches next month", "unreleased"))
post("Email", "Book your first Lumio Live session with a tutor today.", (["MSG-2", "FACT-4"], "Book your first Lumio Live session", "unreleased"))
post("LinkedIn", "Offline mode for iPhone arrives in January.", (["MSG-2", "FACT-5"], "Offline mode for iPhone arrives in January", "unreleased"))
# --- Unsupported claims -------------------------------------------------------------
post("Instagram", "Lumio is the best study app for board exams.", ("CLAIM-1", "the best", "claims"))
post("LinkedIn", "Proud to be India's leading study platform.", ("CLAIM-1", "India's leading", "claims"))
post("Website", "The number one way to revise smarter.", ("CLAIM-1", "number one", "claims"))
post("Blog", "World-class flashcards, built for you.", ("CLAIM-1", "World-class", "claims"))
post("Instagram", "Our study plans guarantee better marks.", ("CLAIM-2", "guarantee", "claims"))
post("Email", "Follow the plan and get 100% results in your boards.", ("CLAIM-2", "100% results", "claims"))
post("Website", "Your notes are 100% safe with Lumio.", ("CLAIM-3", "100% safe", "claims"))
post("Blog", "Lumio is unhackable, so you never have to worry.", ("CLAIM-3", "unhackable", "claims"))
post("Instagram", "Score a top rank this year with Lumio, guaranteed.", ("CLAIM-2", "guaranteed", "claims"))
# --- Tone ------------------------------------------------------------------------------
post("Email", "We hereby confirm your subscription.", ("TONE-1", "hereby", "tone"))
post("Email", "You can utilise study plans to organise each week.", ("TONE-1", "utilise", "tone"))
post("LinkedIn", "We leverage AI to plan your revision.", ("TONE-1", "leverage", "tone"))
post("Website", "Pursuant to your request, your plan has been updated.", ("TONE-1", "Pursuant to", "tone"))
post("Instagram", "Results day is here!!! Good luck, everyone.", ("TONE-2", "!!!", "tone"))
post("X / Twitter", "New flashcard packs!! Science and maths first.", ("TONE-2", "!!", "tone"))
post("Blog", "Students should review their flashcards every day.", ("TONE-3", "Students should review their flashcards every day", "tone"))
post("Email", "Learners must log their study hours to see progress.", ("TONE-3", "Learners must log their study hours", "tone"))
# --- Accessibility -------------------------------------------------------------------
post("Email", "Your study plan is ready. Click here to open it.", ("ACC-1", "Click here", "accessibility"))
post("Blog", "Five ways to revise faster.\n\n![](revision-tips.png)", ("ACC-2", "![](revision-tips.png)", "accessibility"))
post("Instagram", "This week's revision streak was insane.", ("ACC-3", "insane", "accessibility"))
post("X / Twitter", "Cramming the night before is crazy. Plan ahead instead.", ("ACC-3", "crazy", "accessibility"))
# --- Mixed posts ---------------------------------------------------------------------
post("Instagram", "Big news!! Lumeo is the best study app, and Lumio Pro is only ₹149/month.",
     ("TONE-2", "!!", "tone"), ("TERM-1", "Lumeo", "product_name"), ("CLAIM-1", "the best", "claims"),
     ("TERM-2", "Lumio Pro", "product_name"), (FACT_PRICE, "₹149/month", "facts_prices"))
post("Email", "We hereby invite all users to Lumio Live. Click here to join.",
     ("TONE-1", "hereby", "tone"), ("TERM-6", "users", "terminology"),
     (["MSG-2", "FACT-4"], "invite all users to Lumio Live", "unreleased"), ("ACC-1", "Click here", "accessibility"))
post("LinkedIn", "Lumio is 100% secure and guarantees results for 2 lakh learners.",
     ("CLAIM-3", "100% secure", "claims"), ("CLAIM-2", "guarantees", "claims"), (["FACT-3", "MSG-1"], "2 lakh learners", "facts_prices"))
post("Blog", "Flash cards work. Our users utilise them daily.",
     ("TERM-3", "Flash cards", "terminology"), ("TERM-6", "users", "terminology"), ("TONE-1", "utilise", "tone"))
post("Website", "Get the Diwali offer: 40% off Lumio Premium!!",
     (["FACT-6", "MSG-1"], "Diwali offer: 40% off", "outdated_fact"), ("TERM-2", "Lumio Premium", "product_name"), ("TONE-2", "!!", "tone"))
# --- Clean, on-brand posts (expect no findings) --------------------------------------
post("Instagram", "Got 20 minutes? Pick one chapter, turn it into flashcards and test yourself twice.")
post("Email", "Your free plan includes up to 3 study plans and 200 flashcards. Sign in to start your first one.")
post("Website", "Lumio Plus costs ₹199 per month or ₹1,999 per year.")
post("Blog", "Small, regular revision beats one long night before the exam. We'll help you plan the week.")
post("LinkedIn", "Lumio encrypts your data in transit and at rest, and we never sell learner data.")
post("X / Twitter", "Offline mode is available on Android. Download a plan before your train ride.")
post("Instagram", "Exam season tip: sleep matters as much as revision. Plan breaks into your day.")
post("Email", "Welcome to Lumio! You can build your first study plan in two minutes.")

json.dump({"brand": "Lumio (demo Brand Kit in src/lib/demo-kit.ts)", "evaluated_on": "2026-11-19", "today_for_facts": "2026-11-19",
           "matching": "A finding is a true positive when it cites one of the expected source codes and its span overlaps the expected quote (one-to-one).",
           "posts": P}, open("eval/dataset.json", "w"), ensure_ascii=False, indent=1)
print(len(P), "posts,", sum(len(p["expected"]) for p in P), "expected findings,", sum(1 for p in P if not p["expected"]), "clean posts")
