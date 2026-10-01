# Startup Leiria Mentorship Platform

A comprehensive mentorship platform for startups built with React, TypeScript, and Supabase (via Lovable Cloud).

## Features

- **Multi-program Support**: Startups can participate in multiple programs with separate workspaces
- **Role-based Access**: Admin, Consultor, Mentor Externo, Founder, Team Member roles
- **Workspace Management**: Sessions, Action Items, Milestones, KPIs, Templates, Documents
- **Health Scoring**: Track startup health with customizable metrics
- **Document Storage**: Secure file uploads with workspace-level access control
- **Admin Panel**: Manage programs, stages, users, KPIs, and templates

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router v6

## Prerequisites

- Node.js 18+ and npm
- A Supabase project (or use Lovable Cloud)

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Your Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` - Your Supabase project ID

## Local Development

> **Important**: Do NOT commit `.env` files to version control. The `.env` file is auto-managed by Lovable Cloud. Copy `.env.example` and fill in your values if running locally.

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:8080`

## Building for Production

```bash
# Build the app
npm run build

# Preview production build
npm run preview
```

## Database Setup

If setting up a new Supabase project, run the migrations in order from `supabase/migrations/`.

Key tables:
- `profiles` - User profiles
- `programs` - Mentorship programs
- `stages` - Program stages
- `startups` - Startup companies
- `workspaces` - Program-startup combinations
- `workspace_users` - User assignments to workspaces
- `sessions`, `action_items`, `milestones` - Workspace activities
- `kpi_definitions`, `kpi_values`, `workspace_kpis` - KPI tracking
- `templates`, `template_instances` - Reusable templates
- `documents` - File metadata

## Project Structure

```
src/
├── components/
│   ├── admin/        # Admin panel components
│   ├── layout/       # App layout, sidebar, topbar
│   ├── ui/           # shadcn/ui components
│   └── workspace/    # Workspace tab components
├── contexts/         # React contexts (Auth)
├── hooks/            # Custom hooks (data fetching, state)
├── integrations/     # Supabase client & types
├── pages/            # Route pages
└── types/            # TypeScript types
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Deployment

### Lovable
Click the "Publish" button in the Lovable editor.

### Other Platforms
Build the project and deploy the `dist/` folder to any static hosting:
- Vercel
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront

Ensure environment variables are configured in your hosting platform.

## License

Private - All rights reserved.

## Contribution rules (RC9 lessons)

- Every new migration with `CREATE FUNCTION … SECURITY DEFINER` ends with `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;` before the intended `GRANT`s. `REVOKE FROM PUBLIC` alone is not enough on Supabase.
- No client `update`/`delete`/`insert` without `.select('id')` and a check of affected rows when the result matters to the user. A success toast only fires after that check.
- No `try/catch` around supabase-js calls, `invokeWithAuth`, or Resend: read the `{ error }` instead.
- No `as any`/`as never` on `insert`/`update` payloads. Twelve of this round's defects were non-existent columns that `tsc` would have caught.
- Buttons visible only to users RLS lets write. The client's `isStaff` includes backoffice; the database's `is_staff()` does not. Use `can_access_backoffice()` in the database and `isBackoffice` on the client when the backoffice owns the flow.
- New i18n keys ship with hand-written PT and EN in the same commit.
- pgTAP before the SQL, run on the harness with Supabase default privileges emulated (P1.11).
