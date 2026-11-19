import Link from "next/link";
import { Logo } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI disclosure · BrandGuard" };

async function workspaceContext() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const [{ data: profile }, conf, logos, colors] = await Promise.all([
      supabase.from("profiles").select("workspace_id, role").eq("id", auth.user.id).maybeSingle(),
      supabase.from("confidential_terms").select("kind"),
      supabase.from("brand_logos").select("id"),
      supabase.from("brand_colors").select("id"),
    ]);
    if (!profile) return null;
    const { data: ws } = await supabase.from("workspaces").select("name").eq("id", profile.workspace_id).maybeSingle();
    const kinds = (conf.data ?? []).reduce<Record<string, number>>((a, c) => ((a[c.kind] = (a[c.kind] ?? 0) + 1), a), {});
    return { name: ws?.name ?? "Your workspace", kinds, logos: logos.data?.length ?? 0, colors: colors.data?.length ?? 0, schema: !conf.error };
  } catch {
    return null;
  }
}

export default async function AiDisclosure() {
  const ws = await workspaceContext();
  const aiOn = Boolean(process.env.GEMINI_API_KEY);
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
  return (
    <div className="landing min-h-screen">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Link href="/" className="[&_svg_path:first-child]:text-ink"><Logo className="font-display [font-stretch:110%]" /></Link>
          <Link href={ws ? "/dashboard" : "/login"} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">{ws ? "Open workspace" : "Sign in"}</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-14">
        <p className="kicker text-ink-soft">Transparency</p>
        <h1 className="display-wide mt-3 text-[clamp(2.4rem,6vw,4.6rem)]">AI disclosure</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          What BrandGuard sends to an AI provider, what it never sends, and how much the AI is trusted. This page describes the deployed code.
        </p>

        {ws && (
          <section className="clipping mt-10 rounded-2xl p-6">
            <h2 className="font-display text-xl font-bold">{ws.name}: current settings</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Item k="AI checks on this deployment" v={aiOn ? `On: Google Gemini (${model}, fallback ${fallback})` : "Off: rule checks only"} />
              <Item k="Always masked" v="Email addresses and phone numbers" />
              <Item
                k="Masked for this workspace"
                v={ws.schema ? `${ws.kinds.term ?? 0} confidential terms · ${ws.kinds.unreleased_product ?? 0} unreleased products · ${ws.kinds.pattern ?? 0} custom patterns` : "Confidential Terms need the 0002 database update"}
              />
              <Item k="Visual identity used for image checks" v={`${ws.colors} palette colours · ${ws.logos} logo files`} />
            </dl>
            <p className="mt-4 text-sm text-ink-soft">Admins can change these under Brand Kit → Confidential and Brand Kit → Visual identity.</p>
          </section>
        )}

        <div className="mt-10 grid gap-8">
          <Block title="Where AI is used">
            <ul className="list-disc space-y-1.5 pl-5">
              <li><strong>Draft check:</strong> the draft, its title, channel and stated purpose, and the active Brand Kit (rules, terms, facts) are sent to Gemini, which returns structured findings.</li>
              <li><strong>Guideline import:</strong> text extracted from an uploaded guideline document is sent to Gemini to propose rules. An admin must approve each one.</li>
              <li><strong>Image check:</strong> the uploaded image and the Brand Kit logo files are sent to Gemini vision to read text in the image, suggest alt text and match logos.</li>
              <li><strong>Not AI:</strong> terminology and pattern checks, colour measurement, WCAG contrast measurement, the grounding gate, masking, insights and approvals are ordinary code.</li>
            </ul>
          </Block>
          <Block title="Confidentiality masking">
            <p>
              Before any text request is built, email addresses, phone numbers, Confidential Terms, unreleased product names and admin-defined
              patterns are replaced with placeholders that are unique to that request (for example <code>[[EMAIL_1_k3f9q2]]</code>). A final
              check refuses to send a request that still contains a protected value. The original values are restored in the quotes and fixes
              shown to you. Failed AI calls are logged with a short reason only, never with draft text.
            </p>
            <p className="mt-2">
              <strong>Limitation:</strong> masking works on text. Pixels in an uploaded image are sent as they are. Don&apos;t upload images
              that show confidential information.
            </p>
          </Block>
          <Block title="How much the AI is trusted">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Every AI finding must cite a real Brand Kit code and quote words that are actually in the draft. Anything else is discarded.</li>
              <li>Suggested fixes are only suggestions. A person accepts, edits or disputes each one, and only a reviewer can approve content.</li>
              <li>Draft text and image text are treated as untrusted data. Instructions inside them are ignored.</li>
              <li>Accuracy is measured on a published evaluation set. The precision and recall that were actually measured are in the repository README.</li>
            </ul>
          </Block>
          <Block title="Storage and retention">
            <p>
              Drafts, findings, images and the result cache are stored in this workspace&apos;s Supabase Postgres database and private storage
              buckets, isolated by row-level security. API keys stay on the server. Whether the AI provider retains requests is governed by
              the provider&apos;s terms for the API key the deployment uses.
            </p>
          </Block>
        </div>
      </main>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="kicker text-ink-soft">{k}</dt>
      <dd className="mt-1 font-medium">{v}</dd>
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t-2 border-ink pt-6">
      <h2 className="font-display text-2xl font-bold [font-stretch:105%]">{title}</h2>
      <div className="mt-3 leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}
