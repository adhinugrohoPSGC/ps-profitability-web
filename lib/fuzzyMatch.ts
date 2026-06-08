export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

export function similarity(a: string, b: string): number {
  const al = a.toLowerCase().trim(), bl = b.toLowerCase().trim()
  if (al === bl) return 1
  const maxLen = Math.max(al.length, bl.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(al, bl) / maxLen
}

export interface MatchResult {
  name: string
  id: number
  score: number
}

export function findBestMatches(
  input: string,
  candidates: { id: number; consultant_name: string }[]
): MatchResult[] {
  return candidates
    .map(c => ({ name: c.consultant_name, id: c.id, score: similarity(input, c.consultant_name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}
