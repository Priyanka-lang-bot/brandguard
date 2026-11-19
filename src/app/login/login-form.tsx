"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "@/app/actions/auth";

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [inState, inAction, inPending] = useActionState(signIn, null);
  const [upState, upAction, upPending] = useActionState(signUp, null);
  const signup = mode === "signup";
  const state = signup ? upState : inState;
  const pending = signup ? upPending : inPending;
  return (
    <form action={signup ? upAction : inAction} className="mt-4 grid gap-3" key={mode}>
      {signup && (
        <div>
          <label className="label" htmlFor="full_name">Your name</label>
          <input id="full_name" name="full_name" required minLength={2} className="input" autoComplete="name" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={signup ? 8 : undefined}
          className="input"
          autoComplete={signup ? "new-password" : "current-password"}
        />
        {signup && <p className="mt-1 text-xs text-dim">At least 8 characters. You join the Lumio demo workspace as a creator.</p>}
      </div>
      {state?.error && <p role="alert" className="rounded-xl border border-proof/30 bg-proof/10 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <button className="btn-primary py-2.5" disabled={pending}>
        {pending ? (signup ? "Creating account…" : "Signing in…") : signup ? "Create account" : "Sign in"}
      </button>
      <button type="button" className="btn-ghost btn-sm justify-self-center" onClick={() => setMode(signup ? "signin" : "signup")}>
        {signup ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </form>
  );
}
