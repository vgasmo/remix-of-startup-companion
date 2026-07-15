# Storage buckets bootstrap runbook

The reconciliation + PHC pipelines require two **private, admin-only** storage buckets:

| Bucket id       | Public | Used by                                                       |
| --------------- | ------ | ------------------------------------------------------------- |
| `admin-exports` | false  | Admin-only exports (CSV/ZIP dumps from AdminContracts, etc.). |
| `phc-extracts`  | false  | Raw PHC census/reconciliation extracts.                       |

## Policies (idempotent via migration)

Migration `supabase/migrations/20260715135408_004f1b87-026d-42d6-988c-e42ea8bc6aaa.sql`
re-asserts the admin-only RLS policies on `storage.objects`:

- `admin_exports_admin_all` — `has_role(auth.uid(), 'admin') AND bucket_id = 'admin-exports'`
- `phc_extracts_admin_all`  — `has_role(auth.uid(), 'admin') AND bucket_id = 'phc-extracts'`

Both use `DROP POLICY IF EXISTS` + `CREATE POLICY`, so they replay cleanly on any project restore.

## Buckets (manual bootstrap — platform gap)

The Lovable Cloud migration tool **rejects** any SQL that mentions `storage.buckets`.
`storage.buckets` writes must be issued via the storage bucket tool, which does not
serialize itself into the migration history. On a clean project restore, therefore,
the two buckets must be recreated out-of-band before the pipelines are exercised:

1. In the Lovable builder, ask the agent (or the operator) to run the storage bucket
   tool twice, both with `public: false`:
   - `admin-exports`
   - `phc-extracts`
2. Confirm both exist and are private via `select id, public from storage.buckets`.
3. Re-run the failed pipeline; policies were already applied by the migration above.

The tool returns HTTP 409 `Duplicate` when the bucket already exists — this is the
signal that the bootstrap has already been done for this project. Treat it as success.

## Verification

```sql
select id, public
  from storage.buckets
 where id in ('admin-exports', 'phc-extracts')
 order by id;

select policyname
  from pg_policies
 where schemaname = 'storage'
   and tablename = 'objects'
   and policyname in ('admin_exports_admin_all', 'phc_extracts_admin_all');
```

Both queries must return two rows for the bootstrap to be considered complete.
