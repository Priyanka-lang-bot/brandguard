export type Role = "admin" | "reviewer" | "creator";
export type Category = "tone" | "terminology" | "claims" | "messaging" | "accessibility" | "visual";
export type Severity = "high" | "medium" | "low";
export type DraftStatus = "draft" | "in_review" | "changes_requested" | "approved";
export type FindingStatus = "open" | "accepted" | "edited" | "disputed";
export type SourceType = "rule" | "term" | "fact";

export interface Rule {
  id: string;
  code: string;
  category: Category;
  title: string;
  description: string;
  severity: Severity;
  patterns: string[];
  status: "active" | "pending" | "rejected";
  source: string;
  source_excerpt?: string | null;
}

export interface Term {
  id: string;
  preferred: string;
  banned: string[];
  note: string;
}

export interface Fact {
  id: string;
  code: string;
  topic: string;
  statement: string;
  valid_until: string | null;
}

export interface BrandKit {
  rules: Rule[];
  terms: Term[];
  facts: Fact[];
}

/** A finding produced by the engine, before it is stored. */
export interface Candidate {
  category: Category;
  severity: Severity;
  quote: string;
  start: number;
  end: number;
  source_type: SourceType;
  source_id: string;
  source_label: string;
  explanation: string;
  suggestion: string;
  engine: "rules" | "ai";
}

export interface Finding {
  id: string;
  version_id: string;
  draft_id: string;
  category: Category;
  severity: Severity;
  quote: string;
  start_idx: number;
  end_idx: number;
  source_type: SourceType;
  rule_id: string | null;
  term_id: string | null;
  fact_id: string | null;
  source_label: string;
  explanation: string;
  suggestion: string;
  engine: string;
  status: FindingStatus;
  resolution_text: string | null;
  dispute_reason: string | null;
  resolved_at: string | null;
}

export interface Draft {
  id: string;
  workspace_id: string;
  author_id: string;
  title: string;
  purpose: string;
  channel: string;
  status: DraftStatus;
  current_version: number;
  reviewer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftVersion {
  id: string;
  draft_id: string;
  version_no: number;
  content: string;
  source_file: string | null;
  note: string;
  ai_checked: boolean;
  created_by: string;
  created_at: string;
}

export interface Profile {
  id: string;
  workspace_id: string;
  full_name: string;
  role: Role;
}
