# Plan: P3A + P3B + P3C + P4B

Four parallel cleanup/refactor items. All touch UI/i18n only — no schema or RLS changes.

## P3A — Public contract flow ternaries → `t()` (~123 occurrences)

Files: `src/pages/PublicContractSigning.tsx` (79), `src/pages/PublicContractIntake.tsx` (44)

Pattern today:
```tsx
{lang === 'pt' ? 'Bem-vindo' : 'Welcome'}
```

Approach:
1. Both files already compute `lang` from `i18n.language`. Keep — `useTranslation()` and `t()` already imported in many places, otherwise add.
2. Write a Python pass that:
   - Captures every ` ? 'PT' : 'EN' ` literal pair (including JSX-attribute and template-string forms),
   - Generates a stable key (`publicContractSigning.<slug>` / `publicContractIntake.<slug>`) from the EN string,
   - Replaces the ternary in source with `{t('publicContractSigning.<key>')}` (or string form for attributes),
   - Emits a JSON patch added to both `en.json` and `pt.json` (EN ← English literal, PT ← Portuguese literal),
   - Skips inline `lang === 'pt'` branches that select *non-string* content (those stay).
3. For the `OPTIONAL_DOCS` array (and similar `labelPt/labelEn` shaped data), keep the array shape but render via `lang === 'pt' ? labelPt : labelEn` — these are intentional and stay (only the dozens of free-floating ternaries get migrated).
4. Re-run the i18n parity script.

## P3B — `IntegrationsSetup` CONTENT object migration

File: `src/pages/IntegrationsSetup.tsx` (695 lines)

There is a large `CONTENT = { pt: {...}, en: {...} }` object that the page consumes via `CONTENT[lang]`. Migrate it to the i18n catalogs.

Approach:
1. View the `CONTENT` object's shape. Flatten each leaf into `integrationsSetup.<path>` keys, preserving nested structure (sections/steps/labels).
2. Add the flat keys to both `en.json` and `pt.json`.
3. Replace every `CONTENT[lang].foo.bar` with `t('integrationsSetup.foo.bar')`. Arrays (e.g. step lists) become `t('integrationsSetup.steps', { returnObjects: true })`.
4. Delete the CONTENT object and the `lang` derivation if unused after migration.

## P3C — `defaultValue` English fallbacks → PT (85 sites)

Files: `src/components/founder/SmartImportDialog.tsx` (39), `src/components/admin/AdminTemplatesManager.tsx` (46)

Today these read:
```tsx
t('foo.bar', { defaultValue: 'English text' })
```

Per Bilingual Trust rule: the `defaultValue` shouldn't be English (that's what `en.json` is for); it should mirror the Portuguese key, so PT users get correct PT even before i18n catalog hydration (and EN users still get correct EN from `en.json`).

Approach:
1. For each `defaultValue: '...'` site in those two files, look up the existing key in `pt.json`:
   - If the PT translation exists → replace `defaultValue` with the PT string (or drop `defaultValue` entirely since PT is in catalog).
   - If missing → add the EN string to `en.json` under that key, add a freshly translated PT string to `pt.json` under that key, and drop the `defaultValue` from the call site.
2. Keep typed signatures identical (no behavior change beyond text).
3. Run i18n parity check.

## P4B — `CreateStartupDialog` rewrite

File: `src/components/founder/CreateStartupDialog.tsx` (303 lines)

Migrate to react-hook-form + zod + draft autosave, matching the rest of the codebase.

Approach:
1. Define `createStartupSchema` with zod: required `name` (min 2), optional `industry`, `stage` enum, `description` (max 500), `website` (url or empty), etc. — keep same fields the dialog has today.
2. Use `useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues })`.
3. Render fields via shadcn `<Form>` + `<FormField>` + `<FormMessage>`; replace ad-hoc `useState` + manual validation.
4. Draft autosave: persist `form.watch()` to `sessionStorage` under key `createStartupDialog:draft:<userId>` on debounced change; hydrate `defaultValues` from storage on mount; clear on successful submit or explicit "discard draft" action.
5. Wire `onSubmit` to the existing `useCreateStartup` mutation; preserve current success/error toasts and post-create navigation.
6. Keep dialog UX (Cancel, Submit, loading states) and i18n keys unchanged externally.
7. Add a small unit test covering schema validation if a test file already exists nearby; otherwise skip.

## Validation (all phases)

- `bun` build is checked by harness automatically; verify with a single targeted parity script run.
- Spot-check the i18n parity test (`src/test/i18n-parity.test.ts`) to ensure no missing keys.
- No RLS/security/SQL changes required.

## Out of scope

- No copy rewrites (translations preserve current wording).
- No changes to PublicContractSigning **logic** — only string extraction.
- No changes to `OPTIONAL_DOCS`-style data arrays.
- No new dependencies (RHF/zod/zodResolver are already in the project).
