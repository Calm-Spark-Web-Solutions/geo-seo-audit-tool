export type AuditStatus = "pending" | "running" | "complete" | "failed";

export type CheckResult = "pass" | "warn" | "fail";

export type FixPriority = "high" | "medium" | "low";

export interface Company {
  id: string;
  user_id: string;
  name: string;
  logo_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
}

export interface Community {
  id: string;
  company_id: string;
  name: string;
  website_url: string;
  created_at: string;
}

export interface Audit {
  id: string;
  community_id: string;
  status: AuditStatus;
  score: number | null;
  seo_score: number | null;
  geo_score: number | null;
  pages_crawled: number;
  progress_total: number | null;
  report_pdf_path: string | null;
  report_generated_at: string | null;
  created_at: string;
}

export interface AuditCheck {
  key: string;
  label: string;
  result: CheckResult;
  explanation: string;
}

export interface FixItem {
  priority: FixPriority;
  title: string;
  detail: string;
}

export interface AuditPage {
  id: string;
  audit_id: string;
  url: string;
  score: number | null;
  seo_results: AuditCheck[] | null;
  geo_results: AuditCheck[] | null;
  fixes: FixItem[] | null;
  manual_notes: string | null;
  ai_comment: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  plan: string | null;
  status: string | null;
  created_at: string;
}

export type CompanyRole = "owner" | "admin" | "member";

export interface CompanyMember {
  company_id: string;
  user_id: string;
  role: CompanyRole;
  created_at: string;
}

export interface CompanyInvite {
  id: string;
  company_id: string;
  email: string;
  role: CompanyRole;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface CrawlResult {
  urls: string[];
  source: "sitemap" | "crawl";
}
