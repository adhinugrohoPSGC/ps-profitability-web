# PostgREST row-cap override

Supabase's PostgREST layer defaults to returning at most 1000 rows per
request, no matter what `limit`/`range` the client asks for. This app's
`lib/fetchAll.ts` pages around that cap, but a low cap means *more
sequential round-trips* to load one project's full dataset.

Applied directly to Postgres (not in application code — must be repeated
per environment):

    alter role authenticator set pgrst.db_max_rows = '10000';
    notify pgrst, 'reload config';

**Sandbox:** applied 2026-07-25.
**Production:** NOT yet applied — apply before or immediately after
promoting this branch, or large projects will fall back to the slower
multi-request path (`lib/fetchAll.ts` still works correctly either way,
just slower).

10000 is comfortably above the largest table today (~4,459 rows). Raise
again if any project's timesheet or expense history grows past that.
