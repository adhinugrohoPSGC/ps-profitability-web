import { createBrowserClient } from '@supabase/ssr'

// Browser client for the AUTH Supabase project (user management lives there).
// Falls back to the main project if dedicated auth env vars are not set.
export function createAuthClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_AUTH_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
