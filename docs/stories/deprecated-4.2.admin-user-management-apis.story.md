# Story 4.2: Admin User Management APIs

## Status

Ready for Grooming

## Story

**As a** system administrator,
**I want** dedicated admin APIs to list and edit user profiles,
**so that** I can manage user metadata without exposing these capabilities to regular users.

## Acceptance Criteria

1. `GET /api/admin/users` is available and returns a paginated list of user profiles for admin users only.
2. `GET /api/admin/users` as a non-admin user returns **403 Forbidden**.
3. `GET /api/admin/users/[id]` returns detailed profile data for the specified profile ID when called by an admin.
4. `GET /api/admin/users/[id]` returns **400** for invalid UUIDs and **404** for non-existent profiles.
5. `PUT /api/admin/users/[id]` allows admins to update only the allowed fields (`display_name`, `avatar_url`, and social URLs) and persists those changes.
6. `PUT /api/admin/users/[id]` returns **403** for non-admins and appropriate **400** errors for validation failures.
7. All `/api/admin/users*` endpoints enforce both Supabase auth (authenticated user) and admin role checks before accessing data.
8. RLS on `public.profiles` still prevents unauthorized access even if API code is misused (covered by Story 4.1 but verified here via integration tests).

## Tasks / Subtasks

- [ ] Implement shared admin guard utility (AC: 2, 7)

  - [ ] Create a helper function (e.g., `requireAdminUser`) that:
    - [ ] Uses `createClient()` to get Supabase server client.
    - [ ] Calls `supabase.auth.getUser()`.
    - [ ] Fetches the caller's profile from `public.profiles`.
    - [ ] Throws/returns an error if `role !== 'admin'` or user is not authenticated.
  - [ ] Ensure no service role keys are used; rely on anon key + RLS.

- [ ] Implement `GET /api/admin/users` (AC: 1–2, 7)

  - [ ] Add route handler at `src/app/api/admin/users/route.ts`.
  - [ ] Parse query params `page` (default 1) and `limit` (default 20, max 100).
  - [ ] Apply `requireAdminUser` to enforce admin-only access.
  - [ ] Query `public.profiles` selecting `id`, `numeric_user_id`, `display_name`, `email`, `avatar_url`, `role`.
  - [ ] Implement pagination logic (`from`/`to` or equivalent) and return total + totalPages.
  - [ ] Standardize JSON response format with `success`, `data`, and `pagination`.

- [ ] Implement `GET /api/admin/users/[id]` (AC: 3–4, 7)

  - [ ] Add route handler at `src/app/api/admin/users/[id]/route.ts` (GET handler).
  - [ ] Validate `[id]` as UUID; return **400** if invalid.
  - [ ] Apply `requireAdminUser` for admin-only access.
  - [ ] Query `public.profiles` for the specified `id`, selecting:
    - [ ] `id`, `numeric_user_id`, `email`, `display_name`, `avatar_url`,
    - [ ] `twitter_url`, `instagram_url`, `facebook_url`, `youtube_url`, `tiktok_url`, `website_url`, `role`.
  - [ ] Return **404** if the profile is not found.

- [ ] Implement `PUT /api/admin/users/[id]` (AC: 5–7)

  - [ ] Add PUT handler in `src/app/api/admin/users/[id]/route.ts`.
  - [ ] Apply `requireAdminUser` for admin-only access.
  - [ ] Validate request body:
    - [ ] Optional `display_name`: 2–50 characters when present.
    - [ ] Optional URL fields: basic URL format and max length.
  - [ ] Build update payload that includes **only** allowed fields plus `updated_at`.
  - [ ] Call Supabase `update` on `public.profiles` and return the updated profile.
  - [ ] Return consistent JSON structure with `success` and `data` or `error`.

- [ ] Add tests for admin vs non-admin behavior (AC: 2, 6–8)
  - [ ] Create integration tests for `/api/admin/users` and `/api/admin/users/[id]` routes.
  - [ ] Use test users with `role = 'user'` and `role = 'admin'`.
  - [ ] Verify 403 for non-admins, 400/404 for invalid/unknown IDs, and 200 for valid admin operations.
  - [ ] Confirm RLS still enforces access rules even if requests attempt disallowed accesses.

## Dev Notes

### Architecture Context

- This story covers the **API Layer** portion of `docs/architecture/admin-user-management-brownfield-architecture.md`:
  - `/api/admin/users` for listing profiles.
  - `/api/admin/users/[id]` for reading/updating a single profile.
- It relies on the `role` and RLS behavior introduced in Story 4.1.

### Response Shape

- Example list response:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "numeric_user_id": 123,
      "display_name": "Creator One",
      "email": "user@example.com",
      "avatar_url": "https://...",
      "role": "user"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 200,
    "totalPages": 10
  }
}
```

### Security Considerations

- All `/api/admin/*` routes must:
  - Require an authenticated Supabase user.
  - Confirm `role = 'admin'` via `public.profiles`.
- RLS remains the final gatekeeper at the DB layer.
- Admin APIs must **never** attempt to modify `role` in this story.

## Testing

- Integration tests for:
  - Admin vs non-admin access on all admin routes.
  - Valid and invalid UUID handling.
  - Successful updates of allowed fields only.
- Regression tests to ensure non-admin profile flows still work as before.

## Dev Agent Record

### Agent Model Used

Cascade

### Debug Log References

1. Implemented `requireAdminUser` helper for centralized admin checks.
2. Created `/api/admin/users` GET endpoint with pagination support.
3. Created `/api/admin/users/[id]` GET and PUT endpoints.
4. Verified admin vs non-admin behavior and error handling via integration tests.
5. Confirmed RLS still blocks unauthorized access when admin routes are misused.

## Change Log

| Date       | Version | Description                                   | Author |
| ---------- | ------- | --------------------------------------------- | ------ |
| 2025-11-26 | 1.0     | Initial story draft for admin management APIs | PM     |
