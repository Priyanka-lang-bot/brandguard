import { NextResponse, type NextRequest } from "next/server";
import { seedDemo } from "@/lib/seed";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-time demo setup: creates the demo users, Brand Kit and sample drafts.
 * Protected by SETUP_TOKEN; call /api/setup?token=<SETUP_TOKEN> once after deploying.
 */
export async function GET(req: NextRequest) {
  const token = process.env.SETUP_TOKEN;
  if (!token || req.nextUrl.searchParams.get("token") !== token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  }
  const log: string[] = [];
  try {
    await seedDemo(createServiceClient(), (m) => log.push(m));
    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, log, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
