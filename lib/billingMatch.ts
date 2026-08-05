// Matches a master_project.billing_sheet_name against billing_milestones
// project_name values. The source Google Sheet truncates long project names
// (observed limit: 80 characters), so a full, untruncated master name may
// not exact-match the row it belongs to — fall back to a prefix match.

// Below this shared length, a prefix match is too likely to be a coincidence
// between two unrelated projects with the same opening words.
const MIN_PREFIX_MATCH_LEN = 40

export function billingNameMatches(rowName: string, sheetName: string): boolean {
  if (rowName === sheetName) return true
  const shorter = rowName.length <= sheetName.length ? rowName : sheetName
  const longer = rowName.length <= sheetName.length ? sheetName : rowName
  return shorter.length >= MIN_PREFIX_MATCH_LEN && longer.startsWith(shorter)
}

// First whitespace-delimited token (e.g. "0217.001-PRJ-Leo International..."
// -> "0217.001-PRJ-Leo"). Used as a cheap server-side prefix filter before
// the exact/fuzzy match runs client-side.
export function billingNamePrefixToken(name: string): string {
  return name.split(' ')[0] || name
}
