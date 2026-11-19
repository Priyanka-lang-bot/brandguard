import type { BrandKit } from "../types";
import type { MaskConfig } from "./mask";

/** Masking configuration from the Brand Kit's Confidential Terms section. Emails and phones are always masked. */
export function maskConfigFromKit(kit: Pick<BrandKit, "confidential">): MaskConfig {
  const entries = kit.confidential ?? [];
  return {
    emails: true,
    phones: true,
    confidentialTerms: entries
      .filter((e) => e.kind === "term" || e.kind === "unreleased_product")
      .map((e) => ({ term: e.term, kind: e.kind as "term" | "unreleased_product" })),
    patterns: entries.filter((e) => e.kind === "pattern").map((e) => e.term),
  };
}
