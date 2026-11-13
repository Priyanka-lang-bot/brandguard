import { loadKit, requireProfile } from "@/lib/data";
import { todayIso } from "@/lib/engine";
import { aiAvailable } from "@/lib/engine/gemini";
import { KitEditor } from "./kit-editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function BrandKitPage() {
  const { supabase, profile } = await requireProfile();
  const kit = await loadKit(supabase, true);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Brand Kit</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Every finding BrandGuard shows must cite one of these sources. Change a rule, term or fact here and the next check
          uses it straight away. {profile.role === "admin" ? "You can edit everything on this page." : "Only admins can edit it."}
        </p>
      </div>
      <KitEditor kit={kit} isAdmin={profile.role === "admin"} today={todayIso()} aiReady={aiAvailable()} />
    </div>
  );
}
