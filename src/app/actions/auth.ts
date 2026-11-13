"use server";

import { redirect } from "next/navigation";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo-kit";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_: unknown, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
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
