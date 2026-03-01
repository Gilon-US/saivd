# AGENTS.md — AI Agent Guide for SAVD App

> This file provides context for AI coding agents (Cursor, Copilot, Claude, etc.) to understand the codebase, conventions, and contribution guidelines. See [README.md](README.md) for human-focused documentation.

---

## Overview

**SAVD App** (SAIVD) is a video management platform for uploading, processing, and managing videos with Wasabi Cloud Storage, watermarking, and public profile sharing. It uses Next.js 15 (App Router), Supabase (auth + Postgres), and Tailwind CSS.

**Architecture:** Full-stack Next.js with App Router, Supabase Auth + Postgres, Wasabi (S3-compatible) for object storage. Client-side React components use context providers for auth and profile state.

---

## Tech Stack & Versions

| Technology | Version / Notes |
|------------|-----------------|
| Node.js | 18+ |
| Next.js | 15.x (App Router, Turbopack) |
| React | 19.x |
| TypeScript | 5.x (strict mode) |
| Tailwind CSS | 4.x |
| Supabase | @supabase/supabase-js 2.x, @supabase/ssr |
| AWS SDK (Wasabi) | v3 (S3 client, presigned POST) |
| Shadcn UI | Radix primitives + tw-animate-css |
| Testing | Jest 30, React Testing Library, jsdom |
| Linting | ESLint 9, eslint-config-next |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Login, register, forgot-password, reset-password
│   ├── api/                # API route handlers
│   │   ├── videos/         # Video CRUD, upload, confirm, watermark
│   │   ├── profile/        # Profile read/update
│   │   ├── users/          # Public user/QR endpoints
│   │   └── callbacks/      # Webhook callbacks (e.g. watermark)
│   ├── dashboard/          # Protected dashboard pages
│   ├── profile/[userId]/   # Public profile pages (numeric IDs)
│   └── layout.tsx          # Root layout (AuthProvider, Toaster)
├── components/
│   ├── ui/                 # Shadcn UI primitives
│   ├── auth/               # AuthGuard, LoginForm, RegisterForm, etc.
│   ├── video/              # VideoGrid, VideoUploader, UploadModal, etc.
│   └── profile/            # PublicProfileCard, ProfileEditorForm, etc.
├── contexts/               # AuthContext, ProfileContext
├── hooks/                  # useVideos, useVideoUpload, useToast, useFrameAnalysis
├── lib/                    # wasabi, auth (withAuth), utils, watermark, qr-codes
├── utils/
│   ├── supabase/           # client, server, middleware
│   └── validation, videoThumbnail
└── db/                     # setup-videos, setup-profiles
```

- **Path alias:** `@/*` → `./src/*`

---

## Dos and Don'ts

### Do

- Use **functional components** and hooks.
- Use **`createClient()`** from `@/utils/supabase/client` in client components; use `createClient()` from `@/utils/supabase/server` in API routes (async).
- Protect API routes with `withAuth` from `@/lib/auth.ts` or inline `supabase.auth.getUser()`.
- Follow the **API response shape** (see below).
- Use **Shadcn UI** components from `@/components/ui/`; avoid adding new UI libraries.
- Put tests in `__tests__/` next to the module or use `*.test.{ts,tsx}`.
- Prefer `cn()` from `@/lib/utils` for className merging.
- Use **named exports** for components and hooks; default exports for page components.
- Prefix unused variables with `_` to satisfy `@typescript-eslint/no-unused-vars` (e.g. `_req`, `_token`).
- **Verify the build after every change:** run `npm run build` to confirm the production build succeeds before considering the change complete.

### Don't

- Do **not** use `createClient` from `@supabase/supabase-js` directly in app code; use `@/utils/supabase/client` or `server`.
- Do **not** add logic between `createServerClient` and `supabase.auth.getUser()` in middleware (can cause logout issues).
- Do **not** hardcode Supabase/Wasabi credentials; use env vars.
- Do **not** change `output: 'standalone'` behavior without checking Docker/Netlify compatibility.
- Do **not** add direct fetches in components for data; use hooks (e.g. `useVideos`, `useVideoUpload`) or server components.

---

## API Response Format

All API routes return JSON with a consistent shape:

```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string } }
```

Common `error.code` values: `unauthorized`, `validation_error`, `database_error`, `not_found`, `server_error`.

---

## Authentication & Supabase

| Context | Import | Notes |
|---------|--------|------|
| Client (browser) | `createClient` from `@/utils/supabase/client` | Uses `createBrowserClient` from @supabase/ssr |
| Server (API, RSC) | `createClient` from `@/utils/supabase/server` | Uses cookies; call `await createClient()` |
| Middleware | `createServerClient` from `@supabase/ssr` | Implemented in `utils/supabase/middleware.ts` |
| Service role | `createServiceRoleClient` from `@/utils/supabase/service` | For admin/server-only operations |

- Protected routes: `/dashboard`, `/profile`, `/videos` (numeric `/profile/123` and `/profile/123/qr` are public).
- Auth routes: `/login`, `/register`; redirect to `/dashboard/videos` when already authenticated.
- Root `/` redirects to `/login` (unauthenticated) or `/dashboard/videos` (authenticated).

---

## Database

**Supabase Postgres tables:**

- **profiles** — User profile (email, display_name, avatar_url, bio, role, numeric_user_id, etc.)
- **videos** — Video metadata (user_id, filename, original_url, processed_url, status, etc.)

Migrations live in `supabase/migrations/`. Use `createClient` (server) or service role client for DB access.

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Jest |
| `npm run test:watch` | Jest watch mode |
| `npm run test:coverage` | Jest with coverage |
| `npm run docker:dev` | Start dev environment with Docker |
| `npm run docker:prod` | Start production stack |

Single-file checks (recommended for agent workflows):

```bash
npm run lint -- src/path/to/file.tsx
npm test -- src/path/to/__tests__/file.test.ts
```

---

## Testing

- **Framework:** Jest + React Testing Library.
- **Config:** `jest.config.js` (next/jest), `jest.setup.js`.
- **Patterns:** `__tests__/*.test.{ts,tsx}` or `*.test.{ts,tsx}`.
- **Coverage:** `collectCoverageFrom` includes `src/**/*.{ts,tsx}` (excludes `*.d.ts`).
- Mock Supabase and external APIs; use `jest.mock('@/utils/supabase/server')` or equivalent for API tests.

---

## Key Reference Files

| Purpose | File(s) |
|---------|---------|
| Auth wrapper for API | `src/lib/auth.ts` (`withAuth`) |
| Supabase clients | `src/utils/supabase/client.ts`, `server.ts` |
| Route protection | `src/utils/supabase/middleware.ts` |
| Wasabi/S3 config | `src/lib/wasabi.ts` |
| Video upload flow | `src/hooks/useVideoUpload.ts`, `src/app/api/videos/upload/route.ts`, `confirm/route.ts` |
| Form/UI patterns | `src/components/video/VideoUploader.tsx`, `src/components/auth/LoginForm.tsx` |
| Validation helpers | `src/utils/validation.ts` |

---

## Environment Variables

Required for core functionality:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side/admin)
- `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_REGION`, `WASABI_BUCKET_NAME`, `WASABI_ENDPOINT`
- `NEXT_PUBLIC_APP_URL` (for CORS, callbacks)

See `.env.local.example` and README for full list.

---

## Contribution Workflow

1. Create a feature branch from `main`.
2. Follow existing code style (TypeScript strict, Shadcn patterns).
3. Add tests for new behavior.
4. Run `npm run lint`, `npm test`, and `npm run build` before committing to confirm the build succeeds.
5. Update README if adding config or features.
6. The project uses **BMad methodology**; `.cursor/rules/bmad/` and `.bmad-core/` contain agent definitions. Use `@dev` or `@bmad-master` when working within BMad workflows.

---

## Safety & Boundaries

- **Avoid editing:** `next.config.ts` (output mode), `supabase/migrations/` (schema) unless explicitly requested.
- **Be cautious with:** Middleware auth logic; Supabase cookie handling is sensitive.
- **Never commit:** `.env.local`, `.env.docker`, or any file containing secrets.

---

## Good Examples to Copy

- **API route with auth:** `src/app/api/videos/route.ts`
- **Form component:** `src/components/auth/LoginForm.tsx`
- **Data hook:** `src/hooks/useVideos.ts`
- **Protected layout:** `src/app/dashboard/layout.tsx`

---

## Bad Examples to Avoid

- Inline `createClient` from `@supabase/supabase-js` instead of project utils
- Raw `fetch` in components instead of hooks
- Skipping `withAuth` or `getUser()` on protected API routes
- Adding logic between `createServerClient` and `getUser()` in middleware
