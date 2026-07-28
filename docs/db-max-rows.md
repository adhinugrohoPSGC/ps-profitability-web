# PostgREST row-cap override

Supabase's PostgREST layer defaults to returning at most 1000 rows per
request, no matter what `limit`/`range` the client asks for. This app's
`lib/fetchAll.ts` pages around that cap, but a low cap means *more
sequential round-trips* to load one project's full dataset.

Applied directly to Postgres (not in application code):

    alter role authenticator set pgrst.db_max_rows = '10000';
    notify pgrst, 'reload config';

**Applied 2026-07-25.** Sandbox and production share the same Supabase
project (different Postgres schemas, `sandbox` vs `public`, same
`authenticator` role), so this override already covers both — no separate
production step needed.

10000 is comfortably above the largest table today (~4,459 rows). Raise
again if any project's timesheet or expense history grows past that.
