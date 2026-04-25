# Story 4.1: Admin Role Field and Profiles RLS

## Status

Ready for Grooming

## Story

**As a** system administrator,
**I want** a `role` field on user profiles and RLS that recognizes admin users,
**so that** I can safely distinguish admins from regular users and allow admins to manage other profiles without breaking existing behavior.

## Acceptance Criteria

1. `public.profiles` includes a `role` column defined as `TEXT NOT NULL DEFAULT 'user'`.
2. Existing profile rows receive `role = 'user'` after migration.
3. `src/db/schema/profiles.sql` includes the `role` column and matches the live schema.
4. RLS on `public.profiles` allows a regular user (`role = 'user'`) to SELECT and UPDATE **only** their own profile row.
5. RLS on `public.profiles` allows an admin user (`role = 'admin'`) to SELECT and UPDATE **any** profile row.
6. The existing public-read policy for limited public profile fields (used by `/profile/[userId]`) still functions as before.
7. Existing profile flows (e.g., `/api/profile`, dashboard profile page, public profile page) continue to work unchanged for non-admin users.

## Tasks / Subtasks

- [ ] Create Supabase migration for `role` column (AC: 1–2)

  - [ ] Add migration file `supabase/migrations/add_role_to_profiles.sql`.
  - [ ] Add `role TEXT NOT NULL DEFAULT 'user'` to `public.profiles`.
  - [ ] Add `COMMENT ON COLUMN public.profiles.role IS 'Application-level role: admin or user';`.
  - [ ] Add `CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);`.
  - [ ] Run migration in dev and verify `role` is present and defaults to `user`.

- [ ] Update canonical schema file (AC: 1, 3)

  - [ ] Update `src/db/schema/profiles.sql` to include the `role` column in the CREATE TABLE statement.
  - [ ] Ensure ordering of columns matches current schema conventions.
  - [ ] Re-run `setup-profiles.ts` (if used) and confirm no drift between schema file and DB.

- [ ] Extend RLS policies for admin access (AC: 4–5)

  - [ ] Drop existing "view own" and "update own" RLS policies on `public.profiles` if they conflict.
  - [ ] Create new SELECT policy that allows:
    - `auth.uid() = id` **OR** the caller has `role = 'admin'` in `public.profiles`.
  - [ ] Create new UPDATE policy with the same condition.
  - [ ] Verify that the public-read policy for limited fields (used by public profile API) is preserved.

- [ ] Verify behavior for regular users (AC: 4, 7)

  - [ ] With `role = 'user'`, confirm the user can SELECT and UPDATE only their own row.
  - [ ] Confirm attempts to access other users' rows fail due to RLS.
  - [ ] Run smoke tests on `/api/profile` and related UI flows for non-admin users.

- [ ] Verify behavior for admin users (AC: 5, 7)

  - [ ] Manually set a test user’s `role` to `admin` in `public.profiles`.
  - [ ] Confirm that user can SELECT and UPDATE any `public.profiles` row.
  - [ ] Confirm existing profile flows still work for the admin’s own profile.

- [ ] Document the change (AC: 1–7)
  - [ ] Confirm `docs/architecture/admin-user-management-brownfield-architecture.md` references the `role` field and RLS behavior.
  - [ ] Cross-check database design doc (`03-database-design.md`) for consistency.

## Dev Notes

### Architecture Context

- This story corresponds to the **data model and RLS** portion of `docs/architecture/admin-user-management-brownfield-architecture.md`.
- It introduces the minimal role-based access concept without yet exposing any UI or admin APIs.

### Implementation Details

- `role` values for this iteration:
  - `user` (default): regular app user.
  - `admin`: privileged user capable of managing profiles.
- Admin assignment will be done manually (e.g., via Supabase Studio or SQL) until a dedicated role-management feature is implemented.
- RLS uses a self-join on `public.profiles` to determine if the calling user has `role = 'admin'`.

### Security Considerations

- RLS remains the source of truth for row access; API layers will later add additional guards.
- Public-read policy for the public profile feature should remain unchanged to avoid breaking `/profile/[userId]`.

## Testing

- DB-level tests using Supabase SQL console or automated integration tests:
  - Regular user (`role = 'user'`): can SELECT/UPDATE only their own profile.
  - Admin user (`role = 'admin'`): can SELECT/UPDATE any user profile.
- Regression tests:
  - `/api/profile` GET/PUT for non-admin users.
  - Public profile endpoint `/api/profile/[userId]`.
  - Public profile page `/profile/[userId]`.

## Dev Agent Record

### Agent Model Used

Cascade

### Debug Log References

1. Created and ran migration to add `role` column and index.
2. Updated `src/db/schema/profiles.sql` to include `role`.
3. Reworked RLS policies on `public.profiles` to include admin self-join logic.
4. Verified regular user vs admin behavior with test accounts.
5. Confirmed existing profile/public profile flows remained intact.

## Change Log

| Date       | Version | Description                                 | Author |
| ---------- | ------- | ------------------------------------------- | ------ |
| 2025-11-26 | 1.0     | Initial story draft for admin roles and RLS | PM     |
