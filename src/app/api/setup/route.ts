import { NextResponse, type NextRequest } from "next/server";
import { ensureDemoData, resetDemoData } from "@/lib/seed";
import { createServiceClient } from "@/lib/supabase/server";
import { pingGemini } from "@/lib/engine/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Demo setup: adds the demo users, Brand Kit and sample drafts that are missing. Safe to call repeatedly — it
 * never deletes or overwrites data (see src/lib/seed.ts). Protected by SETUP_TOKEN:
 *   /api/setup?token=<SETUP_TOKEN>
 * &reset=1 runs the destructive reset instead (deletes demo-account drafts and the Brand Kit first).
 */
export async function GET(req: NextRequest) {
  const token = process.env.SETUP_TOKEN;
  if (!token || req.nextUrl.searchParams.get("token") !== token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  }
  // ?check=ai verifies the Gemini configuration without touching data.
  if (req.nextUrl.searchParams.get("check") === "ai") {
    const q = req.nextUrl.searchParams;
    const models = (q.get("models") ?? "").split(",").map((m) => m.trim()).filter((m) => /^[\w.-]{3,60}$/.test(m)).slice(0, 8);
    const thinking = q.get("thinking") ?? undefined;
    return NextResponse.json(await pingGemini({ models, thinking }));
  }
  const log: string[] = [];
  try {
    const reset = req.nextUrl.searchParams.get("reset") === "1";
    const summary = await (reset ? resetDemoData : ensureDemoData)(createServiceClient(), (m) => log.push(m));
    return NextResponse.json({ ok: true, mode: reset ? "reset" : "additive", summary, log });
  } catch (e) {
    return NextResponse.json({ ok: false, log, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
