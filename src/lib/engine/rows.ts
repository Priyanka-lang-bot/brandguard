import type { Candidate } from "../types";

/** Database row for a finding. */
export function toRow(c: Candidate, version_id: string, draft_id: string) {
  return {
    version_id,
    draft_id,
    category: c.category,
    severity: c.severity,
    quote: c.quote,
    start_idx: c.start,
    end_idx: c.end,
    source_type: c.source_type,
    rule_id: c.source_type === "rule" ? c.source_id : null,
    term_id: c.source_type === "term" ? c.source_id : null,
    fact_id: c.source_type === "fact" ? c.source_id : null,
    source_label: c.source_label,
    explanation: c.explanation,
    suggestion: c.suggestion,
    engine: c.engine,
  };
}
