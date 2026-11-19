import "server-only";
import { randomUUID } from "node:crypto";
import type { CachedAi, CheckCache } from "../engine";
import type { BrandKit, BrandLogo } from "../types";
import type { createClient } from "../supabase/server";
import { inspectImage, MAX_IMAGE_BYTES } from "./analyze";
import type { ImageAnalysis, ImageRecord } from "./findings";
import { analyzeImage } from "./pipeline";

type Client = Awaited<ReturnType<typeof createClient>>;

export const DRAFT_BUCKET = "draft-images";
export const ASSET_BUCKET = "brand-assets";
export const MAX_IMAGES_PER_DRAFT = 4;

export interface DraftImageRow extends ImageRecord {
  draft_id: string;
  storage_path: string;
  mime: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

export async function loadDraftImages(supabase: Client, draftId: string): Promise<DraftImageRow[]> {
  const { data, error } = await supabase.from("draft_images").select("*").eq("draft_id", draftId).order("created_at");
  if (error) return []; // migration 0002 not applied: drafts simply have no images
  return (data ?? []) as DraftImageRow[];
}

export async function signedImageUrls(supabase: Client, paths: string[], bucket = DRAFT_BUCKET): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

/** Download the Brand Kit logo files so the vision model can compare against them. Unreadable files are skipped. */
export async function loadLogoFiles(supabase: Client, logos: BrandLogo[]): Promise<{ logo: BrandLogo; data: Buffer }[]> {
  const out = await Promise.all(
    logos.slice(0, 4).map(async (logo) => {
      const { data } = await supabase.storage.from(ASSET_BUCKET).download(logo.storage_path);
      return data ? { logo, data: Buffer.from(await data.arrayBuffer()) } : null;
    }),
  );
  return out.flatMap((x) => (x ? [{ logo: x.logo, data: x.data as Buffer }] : []));
}

/** Parse uploaded image files and their alt texts from a form. Throws a user-facing message on invalid input. */
export async function readImageUploads(formData: FormData): Promise<{ name: string; data: Buffer; alt: string }[]> {
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const alts = formData.getAll("image_alt").map((a) => String(a ?? ""));
  if (files.length > MAX_IMAGES_PER_DRAFT) throw new Error(`Attach at most ${MAX_IMAGES_PER_DRAFT} images.`);
  const out = [];
  for (const [i, f] of files.entries()) {
    if (f.size > MAX_IMAGE_BYTES) throw new Error(`${f.name} is larger than 4 MB.`);
    const data = Buffer.from(await f.arrayBuffer());
    try {
      await inspectImage(data);
    } catch (e) {
      throw new Error(`${f.name}: ${e instanceof Error ? e.message : "unsupported image"}`);
    }
    out.push({ name: f.name.slice(0, 160), data, alt: (alts[i] ?? "").trim().slice(0, 500) });
  }
  return out;
}

/** Upload, analyse and record one image for a draft (the caller has already checked ownership). */
export async function attachImage(
  supabase: Client,
  ctx: { workspaceId: string; draftId: string; userId: string; kit: BrandKit },
  upload: { name: string; data: Buffer; alt: string },
): Promise<DraftImageRow> {
  const { mime, width, height } = await inspectImage(upload.data);
  const ext = mime === "image/png" ? "png" : "jpg";
  const path = `${ctx.workspaceId}/${ctx.draftId}/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(DRAFT_BUCKET).upload(path, upload.data, { contentType: mime, upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const logos = await loadLogoFiles(supabase, ctx.kit.logos ?? []);
  const analysis: ImageAnalysis = await analyzeImage(upload.data, { kit: ctx.kit, logos });
  const { data, error } = await supabase
    .from("draft_images")
    .insert({
      draft_id: ctx.draftId,
      workspace_id: ctx.workspaceId,
      storage_path: path,
      file_name: upload.name,
      mime,
      width,
      height,
      bytes: upload.data.length,
      alt_text: upload.alt,
      analysis,
      analysed_at: new Date().toISOString(),
      created_by: ctx.userId,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(DRAFT_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return data as DraftImageRow;
}

/** Result cache in Postgres (table check_cache, workspace-scoped by RLS). Null when the table is missing. */
export function dbCache(supabase: Client, workspaceId: string): CheckCache {
  return {
    async get(key) {
      const { data, error } = await supabase.from("check_cache").select("result").eq("workspace_id", workspaceId).eq("cache_key", key).maybeSingle();
      if (error || !data) return null;
      return data.result as CachedAi;
    },
    async set(key, value) {
      await supabase.from("check_cache").upsert({ workspace_id: workspaceId, cache_key: key, result: value, created_at: new Date().toISOString() });
    },
  };
}
