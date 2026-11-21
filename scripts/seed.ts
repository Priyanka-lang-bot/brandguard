// Usage: npm run seed            add missing demo data (safe to repeat; never deletes or overwrites)
//        npm run seed -- --reset destructive local reset (deletes demo-account drafts and the Brand Kit first)
// Reads .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { ensureDemoData, resetDemoData } from "../src/lib/seed";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local)");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const run = process.argv.includes("--reset") ? resetDemoData : ensureDemoData;
run(admin, (m) => console.log("·", m))
  .then((s) => console.log("Seed complete", JSON.stringify({ created: s.created, skipped: s.skipped })))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
