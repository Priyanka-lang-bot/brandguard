// Local stand-in for the Supabase APIs BrandGuard uses (REST, Auth, Storage), backed by a real Postgres
// with the real migrations and RLS. FOR TESTING ONLY. Every REST request runs in a transaction as the
// caller's role (anon / authenticated / service_role) with request.jwt.claim.sub set, so RLS is enforced
// by Postgres exactly as in Supabase.
//
// Usage: PGURL=postgres://postgres@/bg?host=/tmp&port=54329 JWT_SECRET=... PORT=54321 STORAGE_DIR=/tmp/bg-storage node tests/e2e/mock-supabase.mjs
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

pg.types.setTypeParser(1082, (v) => v); // date as YYYY-MM-DD
const PORT = Number(process.env.PORT || 54321);
const SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret";
const STORAGE = process.env.STORAGE_DIR || "/tmp/bg-storage";
const pool = new pg.Pool({ connectionString: process.env.PGURL });
fs.mkdirSync(STORAGE, { recursive: true });

// ---------------------------------------------------------------- JWT
const b64u = (b) => Buffer.from(b).toString("base64url");
export function sign(payload) {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64u(JSON.stringify(payload));
  const s = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
function verify(token) {
  if (!token) return null;
  const [h, p, s] = token.split(".");
  if (!s) return null;
  const expect = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (expect !== s) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  if (claims.exp && claims.exp < Date.now() / 1000) return null;
  return claims;
}
const passwords = new Map(); // email -> password (in memory; the seed resets them)
const refreshTokens = new Map();

function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({ sub: user.id, role: "authenticated", email: user.email, aud: "authenticated", exp: now + 3600, iat: now });
  const refresh = crypto.randomBytes(24).toString("hex");
  refreshTokens.set(refresh, user.id);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: userJson(user) };
}
const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.created_at, user_metadata: u.raw_user_meta_data ?? {}, app_metadata: { provider: "email" }, created_at: u.created_at, updated_at: u.created_at });

// ---------------------------------------------------------------- helpers
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", ...headers });
  res.end(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { status: 400 }); return `"${s}"`; };

function roleOf(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer /i, "") || req.headers.apikey;
  const claims = verify(token);
  if (!claims) return { role: "anon", sub: null, bad: Boolean(token) };
  return { role: claims.role === "service_role" ? "service_role" : claims.role === "authenticated" ? "authenticated" : "anon", sub: claims.sub ?? null };
}

async function asRole(who, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${who.role}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [who.sub ?? ""]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function pgError(res, e) {
  const code = e.code || "";
  const status = e.status || (code === "42501" ? 403 : code === "23505" ? 409 : code.startsWith("23") ? 400 : code === "42P01" ? 404 : 400);
  const message = code === "42501" && /row-level/.test(e.message) ? e.message : e.message;
  send(res, status, { code, message, details: e.detail ?? null, hint: null });
}

// ---------------------------------------------------------------- REST (PostgREST subset)
const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
function whereClause(params, values) {
  const parts = [];
  for (const [k, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    const m = raw.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.(.*)$/s);
    if (!m) throw Object.assign(new Error(`unsupported filter ${k}=${raw}`), { status: 400 });
    const [, not, op, val] = m;
    let sql;
    if (op === "in") {
      const items = val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
      values.push(items);
      sql = `${ident(k)}::text = any($${values.length}::text[])`;
    } else if (op === "is") {
      sql = `${ident(k)} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`;
    } else {
      values.push(op.includes("like") ? val.replace(/\*/g, "%") : val);
      sql = `${ident(k)}::text ${OPS[op]} $${values.length}`;
      if (op === "eq" || op === "neq") sql = `${ident(k)} ${OPS[op]} $${values.length}`;
    }
    parts.push(not ? `not (${sql})` : sql);
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}
const selectList = (s) => (!s || s === "*" ? "*" : s.split(",").map((c) => ident(c.trim())).join(", "));
function orderBy(o) {
  if (!o) return "";
  return " order by " + o.split(",").map((p) => {
    const [col, ...mods] = p.split(".");
    const dir = mods.includes("desc") ? "desc" : "asc";
    const nulls = mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : "";
    return `${ident(col)} ${dir}${nulls}`;
  }).join(", ");
}

async function rest(req, res, url, who) {
  const table = url.pathname.replace("/rest/v1/", "");
  const params = [...url.searchParams.entries()];
  const values = [];
  const single = (req.headers.accept || "").includes("vnd.pgrst.object");
  const prefer = req.headers.prefer || "";
  const wantRows = prefer.includes("return=representation");
  const t = ident(table);
  let result;
  await asRole(who, async (c) => {
    if (req.method === "GET" || req.method === "HEAD") {
      let sql = `select ${selectList(url.searchParams.get("select"))} from public.${t}${whereClause(params, values)}${orderBy(url.searchParams.get("order"))}`;
      const range = req.headers.range?.match(/(\d+)-(\d+)/);
      const limit = url.searchParams.get("limit") ?? (range ? Number(range[2]) - Number(range[1]) + 1 : null);
      const offset = url.searchParams.get("offset") ?? (range ? Number(range[1]) : null);
      if (limit !== null) sql += ` limit ${Number(limit)}`;
      if (offset !== null) sql += ` offset ${Number(offset)}`;
      result = (await c.query(sql, values)).rows;
    } else if (req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString() || "[]");
      const rows = Array.isArray(body) ? body : [body];
      const cols = url.searchParams.get("columns")?.split(",").map((x) => x.replace(/"/g, "")) ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
      if (!rows.length) { result = []; return; }
      values.push(JSON.stringify(rows));
      const upsert = prefer.includes("resolution=merge-duplicates");
      const conflict = url.searchParams.get("on_conflict");
      let pk = conflict;
      if (upsert && !pk) {
        const r = await c.query(`select string_agg(a.attname, ',') k from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary`, [`public.${table}`]);
        pk = r.rows[0].k;
      }
      // Columns missing from a row get their column default, like PostgREST with missing=default.
      const sel = cols.map((col) => `case when r.j ? '${col.replace(/'/g, "")}' then (jsonb_populate_record(null::public.${t}, r.j)).${ident(col)} else null end`).join(", ");
      const defaults = await c.query(`select attname, pg_get_expr(adbin, adrelid) d from pg_attrdef join pg_attribute on attrelid=adrelid and attnum=adnum where adrelid=$1::regclass`, [`public.${table}`]);
      const defMap = Object.fromEntries(defaults.rows.map((r) => [r.attname, r.d]));
      const selWithDefaults = cols.map((col) => {
        const v = `(jsonb_populate_record(null::public.${t}, r.j)).${ident(col)}`;
        return defMap[col] ? `case when r.j ? '${col}' then ${v} else ${defMap[col]} end` : `case when r.j ? '${col}' then ${v} else null end`;
      }).join(", ");
      void sel;
      let sql = `insert into public.${t} (${cols.map(ident).join(", ")}) select ${selWithDefaults} from jsonb_array_elements($1::jsonb) as r(j)`;
      if (upsert) sql += ` on conflict (${pk.split(",").map(ident).join(", ")}) do update set ${cols.filter((x) => !pk.split(",").includes(x)).map((x) => `${ident(x)} = excluded.${ident(x)}`).join(", ") || `${ident(pk.split(",")[0])} = excluded.${ident(pk.split(",")[0])}`}`;
      sql += ` returning ${selectList(url.searchParams.get("select"))}`;
      result = (await c.query(sql, values)).rows;
    } else if (req.method === "PATCH") {
      const body = JSON.parse((await readBody(req)).toString() || "{}");
      const cols = Object.keys(body);
      values.push(JSON.stringify(body));
      const sets = cols.map((col) => `${ident(col)} = (jsonb_populate_record(null::public.${t}, $1::jsonb)).${ident(col)}`).join(", ");
      const sql = `update public.${t} set ${sets}${whereClause(params, values)} returning ${selectList(url.searchParams.get("select"))}`;
      result = (await c.query(sql, values)).rows;
    } else if (req.method === "DELETE") {
      const sql = `delete from public.${t}${whereClause(params, values)} returning ${selectList(url.searchParams.get("select"))}`;
      result = (await c.query(sql, values)).rows;
    }
  });
  if (single) {
    if (result.length !== 1) return send(res, 406, { code: "PGRST116", message: `JSON object requested, multiple (or no) rows returned`, details: `The result contains ${result.length} rows`, hint: null });
    return send(res, 200, result[0]);
  }
  if (req.method !== "GET" && !wantRows) return send(res, 201, "");
  send(res, 200, result, { "content-range": `0-${Math.max(0, result.length - 1)}/*` });
}

// ---------------------------------------------------------------- Auth (GoTrue subset)
async function auth(req, res, url, who) {
  const p = url.pathname.replace("/auth/v1", "");
  const body = req.method === "GET" ? {} : JSON.parse((await readBody(req)).toString() || "{}");
  const q = (sql, v) => pool.query(sql, v);
  if (p === "/token" && url.searchParams.get("grant_type") === "password") {
    const { rows } = await q("select * from auth.users where lower(email)=lower($1)", [body.email]);
    if (!rows[0] || passwords.get(rows[0].email) !== body.password) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials", msg: "Invalid login credentials" });
    return send(res, 200, session(rows[0]));
  }
  if (p === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const id = refreshTokens.get(body.refresh_token);
    if (!id) return send(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
    const { rows } = await q("select * from auth.users where id=$1", [id]);
    return send(res, 200, session(rows[0]));
  }
  if (p === "/user") {
    if (who.role !== "authenticated") return send(res, 401, { code: 401, msg: "invalid JWT", error_code: "bad_jwt" });
    const { rows } = await q("select * from auth.users where id=$1", [who.sub]);
    return rows[0] ? send(res, 200, userJson(rows[0])) : send(res, 404, { msg: "User not found" });
  }
  if (p === "/logout") return send(res, 204);
  if (p.startsWith("/admin/")) {
    if (who.role !== "service_role") return send(res, 403, { msg: "not admin" });
    if (p === "/admin/users" && req.method === "GET") {
      const { rows } = await q("select * from auth.users order by created_at");
      return send(res, 200, { users: rows.map(userJson), aud: "authenticated" });
    }
    if (p === "/admin/users" && req.method === "POST") {
      const exists = await q("select 1 from auth.users where lower(email)=lower($1)", [body.email]);
      if (exists.rowCount) return send(res, 422, { code: 422, msg: "A user with this email address has already been registered", error_code: "email_exists" });
      const { rows } = await q("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning *", [body.email, body.user_metadata ?? {}]);
      passwords.set(rows[0].email, body.password);
      return send(res, 200, userJson(rows[0]));
    }
    const m = p.match(/^\/admin\/users\/([0-9a-f-]+)$/);
    if (m && req.method === "PUT") {
      const { rows } = await q("select * from auth.users where id=$1", [m[1]]);
      if (body.password) passwords.set(rows[0].email, body.password);
      return send(res, 200, userJson(rows[0]));
    }
  }
  send(res, 404, { msg: `auth route ${p} not implemented in mock` });
}

// ---------------------------------------------------------------- Storage subset
async function storage(req, res, url, who) {
  const p = decodeURIComponent(url.pathname.replace("/storage/v1", ""));
  const file = (bucket, name) => path.join(STORAGE, bucket, name.replace(/\.\./g, ""));
  let m;
  if ((m = p.match(/^\/object\/sign\/([^/]+)$/)) && req.method === "POST") {
    const body = JSON.parse((await readBody(req)).toString());
    const bucket = m[1];
    const visible = await asRole(who, (c) => c.query("select name from storage.objects where bucket_id=$1 and name = any($2)", [bucket, body.paths]));
    const ok = new Set(visible.rows.map((r) => r.name));
    return send(res, 200, body.paths.map((pp) => ok.has(pp)
      ? { path: pp, signedURL: `/object/sign/${bucket}/${pp}?token=${sign({ url: `${bucket}/${pp}`, exp: Math.floor(Date.now() / 1000) + body.expiresIn })}`, error: null }
      : { path: pp, signedURL: null, error: "Object not found" }));
  }
  if ((m = p.match(/^\/object\/sign\/([^/]+)\/(.+)$/)) && req.method === "GET") {
    const claims = verify(url.searchParams.get("token"));
    if (!claims || claims.url !== `${m[1]}/${m[2]}`) return send(res, 400, { error: "invalid signature" });
    const f = file(m[1], m[2]);
    if (!fs.existsSync(f)) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "content-type": m[2].endsWith(".png") ? "image/png" : "image/jpeg" });
    return res.end(fs.readFileSync(f));
  }
  if ((m = p.match(/^\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/))) {
    const [, bucket, name] = m;
    if (req.method === "POST" || req.method === "PUT") {
      const data = await readBody(req);
      try {
        await asRole(who, async (c) => {
          const upsert = req.headers["x-upsert"] === "true";
          if (upsert) await c.query("delete from storage.objects where bucket_id=$1 and name=$2", [bucket, name]);
          await c.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, name, who.sub]);
        });
      } catch (e) {
        return send(res, e.code === "42501" ? 403 : 400, { statusCode: e.code === "42501" ? "403" : "400", error: "Unauthorized", message: e.code === "42501" ? "new row violates row-level security policy" : e.message });
      }
      fs.mkdirSync(path.dirname(file(bucket, name)), { recursive: true });
      fs.writeFileSync(file(bucket, name), data);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
    }
    if (req.method === "GET") {
      const r = await asRole(who, (c) => c.query("select 1 from storage.objects where bucket_id=$1 and name=$2", [bucket, name]));
      if (!r.rowCount || !fs.existsSync(file(bucket, name))) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end(fs.readFileSync(file(bucket, name)));
    }
  }
  if ((m = p.match(/^\/object\/([^/]+)$/)) && req.method === "DELETE") {
    const body = JSON.parse((await readBody(req)).toString());
    const r = await asRole(who, (c) => c.query("delete from storage.objects where bucket_id=$1 and name = any($2) returning name", [m[1], body.prefixes]));
    for (const row of r.rows) fs.rmSync(file(m[1], row.name), { force: true });
    return send(res, 200, r.rows.map((x) => ({ name: x.name })));
  }
  send(res, 404, { error: `storage route ${req.method} ${p} not implemented in mock` });
}

// ---------------------------------------------------------------- server
export const requests = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const who = roleOf(req);
  requests.push(`${req.method} ${url.pathname}`);
  try {
    if (req.method === "OPTIONS") return send(res, 204);
    if (url.pathname.startsWith("/rest/v1/")) return await rest(req, res, url, who);
    if (url.pathname.startsWith("/auth/v1/")) return await auth(req, res, url, who);
    if (url.pathname.startsWith("/storage/v1/")) return await storage(req, res, url, who);
    send(res, 404, { message: "not found" });
  } catch (e) {
    if (process.env.MOCK_DEBUG) console.error(req.method, req.url, e.message);
    pgError(res, e);
  }
});
server.listen(PORT, () => {
  console.log(`mock supabase on :${PORT}`);
  console.log(`ANON_KEY=${sign({ role: "anon", iss: "mock", exp: 4102444800 })}`);
  console.log(`SERVICE_KEY=${sign({ role: "service_role", iss: "mock", exp: 4102444800 })}`);
});
