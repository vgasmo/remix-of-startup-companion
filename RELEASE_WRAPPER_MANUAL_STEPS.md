# Release Wrapper — Manual Post-Export Steps

These three actions cannot be performed by Lovable's in-platform tooling
(`.env`, `.gitignore`, root lockfiles are protected). Run them locally
**after** you export / clone the repo from GitHub, **before** the first push
or release tag.

## 1. Remove the real `.env` from the repository

```bash
git rm --cached .env
echo ".env"        >> .gitignore
echo ".env.*"      >> .gitignore
echo "!.env.example" >> .gitignore
git add .gitignore
git commit -m "chore(release): stop tracking .env, ignore env files"
```

Then **rotate** the Supabase publishable key that was historically committed
(Cloud → Settings → API → Rotate anon key). Even though it is a
publishable key, treat any leak as a rotation event.

## 2. Deduplicate lockfiles — keep `bun.lock` only

```bash
git rm bun.lockb package-lock.json
git commit -m "chore(release): drop bun.lockb and package-lock.json, bun.lock is canonical"
```

Verify:
```bash
ls bun.lock*       # should show only bun.lock
grep packageManager package.json   # must read "bun@1.2.0"
```

## 3. Verify CI gates still pass

```bash
bun install --frozen-lockfile
bun run release-check
```

`release-check` runs: lint → typecheck → build → vitest → i18n parity →
i18n-lint → secret-scan. All must be green before tagging.

---

## Why Lovable cannot do this for you

- `.env` is a Lovable-managed artifact; the platform writes it on every
  sandbox boot from your project secrets. Deleting it inside the sandbox
  has no effect on the exported repo.
- `.gitignore` and root lockfiles (`bun.lockb`, `package-lock.json`) are
  flagged as release-wrapper assets and are not editable from agent tools.
- See: `mem://constraints/release-wrapper-environment-limitations`.
