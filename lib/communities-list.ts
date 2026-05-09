/** Remove LIKE wildcard meta-characters so user input is interpreted literally. */
export function stripLikeMetacharacters(raw: string) {
  return raw.replace(/\\/g, "").replace(/%/g, "").replace(/_/g, "");
}

/** Normalize full-text community search input for URL and `.or(...)` clauses. */
export function normalizeCommunitySearch(raw: string) {
  return raw.replace(/"/g, "").replace(/,/g, " ").trim();
}
