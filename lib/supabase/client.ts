import { createBrowserClient } from '@supabase/ssr'

// Data project connection (business tables). These are PUBLIC values — the
// anon key ships in every browser bundle by design. They are pinned here
// because the generic NEXT_PUBLIC_SUPABASE_* env vars resolved inconsistently
// between Vercel build and runtime scopes (runtime lambdas were reaching the
// auth project). Override only via the DATA-specific vars below.
const DATA_URL =
  process.env.NEXT_PUBLIC_DATA_SUPABASE_URL ??
  'https://dhgowqjfpvbbqrltjifz.supabase.co'
const DATA_ANON_KEY =
  process.env.NEXT_PUBLIC_DATA_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoZ293cWpmcHZiYnFybHRqaWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NDM5NjUsImV4cCI6MjA5NDMxOTk2NX0.qt7s6e329U-KO-WO0Vh373srYAPLU2T2NkKaZSH8GuU'

export function createClient() {
  return createBrowserClient(
    DATA_URL,
    DATA_ANON_KEY,
    { db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public' } }
  )
}
