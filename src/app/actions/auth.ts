"use server";

import { redirect } from "next/navigation";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo-kit";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function signIn(_: unknown, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signUp(_: unknown, formData: FormData) {
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (full_name.length < 2) return { error: "Please enter your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  if (email.endsWith("@brandguard.demo")) return { error: "That address is reserved for the demo accounts." };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: "Sign-up is not configured on this deployment." };

  // Accounts are created confirmed so a new user can start straight away; the sign-up
  // trigger adds them to the workspace as a creator (admins can promote them later).
  const admin = createServiceClient();
  const { error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (cErr) {
    return { error: /already|registered|exists/i.test(cErr.message) ? "An account with this email already exists. Sign in instead." : cErr.message };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function demoSignIn(role: "admin" | "creator" | "reviewer") {
  const user = DEMO_USERS.find((u) => u.role === role)!;
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: DEMO_PASSWORD });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function switchDemoRole(role: "admin" | "creator" | "reviewer", next: string) {
  const user = DEMO_USERS.find((u) => u.role === role)!;
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: DEMO_PASSWORD });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
