# PS Profitability Dashboard

Next.js 15 + Supabase web app for PS Global Consulting project profitability tracking.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database + Auth**: Supabase (PostgreSQL + Row Level Security)
- **Styling**: Tailwind CSS v4
- **Charts**: Recharts
- **Excel**: ExcelJS + SheetJS (xlsx)
- **Icons**: Lucide React

## Local Development

### 1. Prerequisites

- Node.js 18+
- A Supabase project (free tier works)

### 2. Set up the database

1. Go to [supabase.com](https://supabase.com) → your project → SQL Editor
2. Paste and run the contents of `supabase/schema.sql`
3. Verify 8 tables were created with RLS enabled

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `.env.local` with your values from Supabase → Project Settings → API:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to `/login`.

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → import your GitHub repo
3. Framework: **Next.js** (auto-detected)
4. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click **Deploy**

### After deploying

Configure Supabase Auth redirect URLs:

1. Supabase Dashboard → Authentication → URL Configuration
2. **Site URL**: `https://your-project.vercel.app`
3. **Redirect URLs**: add `https://your-project.vercel.app/**`

## First Login

1. Visit `/login` → **Create Account**
2. Check your email for the confirmation link (or disable email confirmation in Supabase → Auth → Settings for internal tools)
3. After confirming, sign in

## Application Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Dashboard | `/dashboard` | KPI cards, cost breakdown, consultant chart, budget vs actual |
| Upload Templates | `/upload` | Import timesheet, expense, and project info XLS files |
| Projects | `/projects` | Create and manage projects |
| Rate Card | `/rate-card` | Manage consultant cost/bill rates |
| Reports | `/reports` | Generate Excel profitability report |
| Settings | `/settings` | Company settings, FX rates, overhead config, data export |

## Data Model Notes

- **Project IDs**: Auto-generated UUIDs (PostgreSQL `gen_random_uuid()`). Users don't enter IDs.
- **Rate Card active field**: Stored as PostgreSQL `BOOLEAN` (not 0/1).
- **User isolation**: All tables use Row Level Security — each user sees only their own data.
- **File operations**: Upload uses browser `FileReader`; Report download uses `URL.createObjectURL`.

## Migrated from

Converted from Electron + SQLite desktop app. All `window.api.invoke()` IPC calls replaced with Supabase client queries.
