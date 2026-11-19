import { hasFinalRoundSchema, loadKit, requireProfile } from "@/lib/data";
import { todayIso } from "@/lib/engine";
import { aiAvailable } from "@/lib/engine/gemini";
import { ASSET_BUCKET, signedImageUrls } from "@/lib/images/store";
import { KitEditor } from "./kit-editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function BrandKitPage({ searchParams }: { searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const { tab, edit } = await searchParams;
  const { supabase, profile } = await requireProfile();
  const [kit, schemaReady] = await Promise.all([loadKit(supabase, true), hasFinalRoundSchema(supabase)]);
  const logoUrls = await signedImageUrls(supabase, (kit.logos ?? []).map((l) => l.storage_path), ASSET_BUCKET);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Brand Kit</h1>
        <p className="mt-1 max-w-3xl text-sm text-mute">
          Every finding BrandGuard shows must cite one of these sources. Change a rule, term, fact, colour or logo here and the next check
          uses it straight away. {profile.role === "admin" ? "You can edit everything on this page." : "Only admins can edit it."}
        </p>
      </div>
      <KitEditor
        kit={kit}
        isAdmin={profile.role === "admin"}
        today={todayIso()}
        aiReady={aiAvailable()}
        schemaReady={schemaReady}
        logoUrls={logoUrls}
        initialTab={tab}
        editRuleId={edit}
      />
    </div>
  );
}
