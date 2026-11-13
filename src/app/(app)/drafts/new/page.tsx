import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/data";
import { NewDraftForm } from "./new-draft-form";

export const maxDuration = 60;

export default async function NewDraftPage() {
  const { profile } = await requireProfile();
  if (profile.role === "reviewer") redirect("/dashboard");
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">New draft</h1>
      <p className="mt-1 text-sm text-slate-600">
        Paste your content or upload a file. BrandGuard checks it against the Lumio Brand Kit and shows every problem with
        the rule it breaks and a suggested fix. Nothing is published or changed without you.
      </p>
      <NewDraftForm />
    </div>
  );
}
