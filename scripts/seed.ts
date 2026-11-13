// Usage: npm run seed   (reads .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional GEMINI_API_KEY)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { seedDemo } from "../src/lib/seed";

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
seedDemo(admin, (m) => console.log("·", m))
  .then(() => console.log("Seed complete"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
