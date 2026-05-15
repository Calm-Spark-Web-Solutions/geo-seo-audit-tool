"use client";

import { useEffect } from "react";
import { setActiveOrgCookie } from "@/lib/active-org-cookie";

/**
 * Drop this anywhere inside a company-scoped page to keep the
 * `rl_active_org` cookie in sync whenever the user navigates to that org.
 */
export function OrgContextSync({ companyId }: { companyId: string }) {
  useEffect(() => {
    void setActiveOrgCookie(companyId);
  }, [companyId]);

  return null;
}
