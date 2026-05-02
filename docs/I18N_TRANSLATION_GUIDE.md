# i18n Translation Guide

**Last Updated:** 2026-01-15  
**Languages:** English (en), Portuguese (pt)

---

## Overview

This guide ensures consistent, high-quality translations across the Leiria Launchpad platform. Follow these conventions when adding or modifying translation strings.

---

## File Locations

```
src/i18n/
├── index.ts           # i18next configuration
└── locales/
    ├── en.json        # English translations
    └── pt.json        # Portuguese translations
```

---

## Key Naming Convention

### Structure: `namespace.subContext.key`

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "loading": "Loading..."
  },
  "nav": {
    "home": "Home",
    "settings": "Settings"
  },
  "workspace": {
    "overview": {
      "title": "Overview",
      "addTags": "Add tags..."
    }
  }
}
```

### Rules

| Rule | Example | Why |
|------|---------|-----|
| Use camelCase | `createStartup` not `create_startup` | Consistent with JS conventions |
| Keep keys short | `nav.home` not `navigation.homePageLink` | Easier to type and read |
| Group by feature | `sessions.create`, `sessions.delete` | Logical grouping |
| Use common for reusable | `common.save`, `common.cancel` | Avoid duplication |

---

## Standardized Terminology (Glossary)

Use these exact terms consistently:

| Concept | English | Portuguese | Notes |
|---------|---------|------------|-------|
| Company entity | **Startup** | **Startup** | Not "company" or "business" |
| Workspace | **Workspace** | **Workspace** | The container for a startup's data |
| Growth phase | **Stage** | **Fase** | Not "phase" or "step" |
| Program | **Program** | **Programa** | Not "cohort" or "batch" |
| Staff advisor | **Consultant** | **Consultor** | Not "advisor" |
| External advisor | **Mentor** | **Mentor** | External mentors only |
| Meeting | **Session** | **Sessão** | Formal meetings |
| Performance metric | **KPI** | **KPI** | Keep English acronym |
| Action item | **Action** | **Ação** | Not "task" (tasks are CRM-specific) |
| Document | **Document** | **Documento** | Pitch decks, reports, etc. |
| Health indicator | **Health Score** | **Health Score** | Keep English term |

---

## Placeholder Syntax

### Basic Interpolation
```json
{
  "welcome": "Welcome, {{name}}!",
  "startupsCount": "{{count}} startups"
}
```

```tsx
t('welcome', { name: 'João' })  // "Welcome, João!"
t('startupsCount', { count: 5 }) // "5 startups"
```

### Pluralization
```json
{
  "itemsCount": "{{count}} item",
  "itemsCount_plural": "{{count}} items"
}
```

```tsx
t('itemsCount', { count: 1 }) // "1 item"
t('itemsCount', { count: 5 }) // "5 items"
```

### Portuguese Pluralization
```json
{
  "itemsCount": "{{count}} item",
  "itemsCount_plural": "{{count}} itens"
}
```

---

## How to Add New Strings

### 1. Find the Right Namespace

| Namespace | Use For |
|-----------|---------|
| `common` | Buttons, labels, generic actions |
| `nav` | Navigation items |
| `dashboard` | Dashboard-specific content |
| `founder` | Founder-facing content |
| `sessions` | Session/meeting related |
| `workspace` | Workspace detail pages |
| `admin` | Admin panel content |
| `backoffice` | Backoffice (spaces, contracts) |

### 2. Add to BOTH Locale Files

Always add to `en.json` AND `pt.json` simultaneously:

```json
// en.json
{
  "workspace": {
    "addTags": "Add tags..."
  }
}

// pt.json
{
  "workspace": {
    "addTags": "Adicionar tags..."
  }
}
```

### 3. Use in Component

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <Button>{t('common.save')}</Button>;
}
```

---

## Common Mistakes to Avoid

### ❌ Hardcoded Strings
```tsx
// BAD
<Button>Save</Button>

// GOOD
<Button>{t('common.save')}</Button>
```

### ❌ Inline Fallbacks with Portuguese/English Mix
```tsx
// BAD - mixes languages
<Button>{t('founder.openWorkspace', 'Abrir')}</Button>

// GOOD - fallback in target language
<Button>{t('founder.openWorkspace')}</Button>
// Ensure key exists in BOTH locale files
```

### ❌ Concatenating Translations
```tsx
// BAD - word order differs by language
t('common.create') + ' ' + t('workspace.title')

// GOOD - single complete key
t('workspace.createWorkspace')
```

### ❌ Formatting Dates/Numbers in Strings
```tsx
// BAD
t('lastUpdated', { date: 'Jan 15, 2026' })

// GOOD - use dateUtils for locale-aware formatting
import { formatShortDate } from '@/lib/dateUtils';
t('lastUpdated', { date: formatShortDate(date) })
```

---

## Quality Checks

### 1. Run Lint Script
```bash
node scripts/i18n-lint.mjs
```

This checks:
- Duplicate top-level keys
- Missing critical namespaces
- English phrases in Portuguese catalog

### 2. Manual Review Checklist

Before merging:
- [ ] New keys added to both `en.json` and `pt.json`
- [ ] Keys follow naming convention
- [ ] Terminology matches glossary
- [ ] No hardcoded strings in new code
- [ ] Placeholders use `{{variable}}` syntax
- [ ] Pluralization handled correctly

### 3. Visual Inspection

Test with both languages:
1. Switch language in settings
2. Check key pages: Dashboard, Workspace, Sessions
3. Look for raw keys showing (e.g., `workspace.addTags`)
4. Look for language mixing

---

## Date/Time Formatting

Always use `src/lib/dateUtils.ts` for locale-aware formatting:

```tsx
import { formatShortDate, formatFullDate, formatTime } from '@/lib/dateUtils';

formatShortDate(date)    // "Jan 15" or "15 jan"
formatFullDate(date)     // "January 15, 2026" or "15 de janeiro de 2026"
formatTime(date)         // "2:30 PM" or "14:30"
```

---

## Adding a New Language

1. Create `src/i18n/locales/{lang}.json`
2. Add to `src/i18n/index.ts` resources
3. Update `src/components/ui/LanguageSelector.tsx`
4. Run `i18n-lint.mjs` to verify parity

---

## Contact

For translation questions or to report issues:
- Create an issue with `[i18n]` prefix
- Tag the component file with the hardcoded string
