// app/api/sync-clickup-manual/route.ts
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'

// Module-level rate limit: full syncs 1/60s; single-project syncs 1/3s
let lastCallMs = 0

export async function POST(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  const minGapMs = projectId ? 3_000 : 60_000
  const now = Date.now()
  if (now - lastCallMs < minGapMs) {
    const waitSec = Math.ceil((minGapMs - (now - lastCallMs)) / 1000)
    return NextResponse.json({ error: `Rate limited — try again in ${waitSec}s` }, { status: 429 })
  }
  lastCallMs = now

  // Delegate to the main sync route handler directly (same process)
  const { POST: syncHandler } = await import('../sync-clickup/route')
  const headers: HeadersInit = process.env.CRON_SECRET
    ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
    : {}
  const url = projectId
    ? `http://localhost/api/sync-clickup?projectId=${encodeURIComponent(projectId)}`
    : 'http://localhost/api/sync-clickup'
  const fakeReq = new NextRequest(url, { method: 'POST', headers })
  return syncHandler(fakeReq)
}
