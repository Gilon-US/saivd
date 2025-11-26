# Story 4.3: Admin Dashboard UI and Profile Editor

## Status

Ready for Grooming

## Story

**As a** system administrator,
**I want** an Admin area in the dashboard where I can list and edit user profiles and preview their public profiles,
**so that** I can manage user metadata through a friendly UI that matches the rest of the application.

## Acceptance Criteria

1. The dashboard header shows an **Admin** navigation item only for users whose profile `role = 'admin'`.
2. Non-admin users (`role = 'user'`) never see the Admin nav item.
3. Admin routes `/dashboard/admin`, `/dashboard/admin/users`, and `/dashboard/admin/users/[id]` are only usable by authenticated admin users; non-admins see a clear 403-style message and/or are redirected back to `/dashboard`.
4. `/dashboard/admin/users` displays a table/list of users with at least: `numeric_user_id`, `display_name`, `email`, `role`, and an **Edit** action per row.
5. Clicking **Edit** on a row navigates to `/dashboard/admin/users/[id]`, where `[id]` is the profile UUID.
6. `/dashboard/admin/users/[id]` shows a form with read-only `numeric_user_id` and `email`, and editable `display_name`, `avatar_url`, and social URL fields.
7. Saving the form sends `PUT /api/admin/users/[id]` and updates the UI with the new values upon success, or shows validation/server errors upon failure.
8. The Admin Profile Editor includes a **Preview** button that opens `/profile/[id]` in a new browser tab, where `[id]` is the profile UUID.
9. Admin UI screens follow the existing dashboard look-and-feel (layout, typography, spacing, and components) and have appropriate loading/error states.

## Tasks / Subtasks

- [ ] Extend ProfileContext to expose `role` (AC: 1–3)

  - [ ] Update `Profile` interface in `src/contexts/ProfileContext.tsx` to include `role: string`.
  - [ ] Update `/api/profile` GET (backend) to include `role` in the selected fields and returned JSON.
  - [ ] Ensure existing callers of `ProfileContext` handle the new field without breaking.

- [ ] Update dashboard layout navigation (AC: 1–2)

  - [ ] Modify `src/app/dashboard/layout.tsx` to read `profile` from `ProfileContext`.
  - [ ] Conditionally render an **Admin** nav item (link to `/dashboard/admin`) only when `profile?.role === 'admin'`.
  - [ ] Verify that non-admin users never see the Admin nav link.

- [ ] Add Admin routes and guards (AC: 3)

  - [ ] Create `src/app/dashboard/admin/page.tsx` that forwards/redirects to `/dashboard/admin/users`.
  - [ ] Create `src/app/dashboard/admin/users/page.tsx` (Admin User List).
  - [ ] Create `src/app/dashboard/admin/users/[id]/page.tsx` (Admin Profile Editor).
  - [ ] Ensure all Admin routes are wrapped by the existing AuthGuard/dashboard protection.
  - [ ] In each Admin page, check `profile.role` from `ProfileContext` and:
    - [ ] If not admin, render a 403-style message or redirect to `/dashboard`.

- [ ] Implement Admin User List UI (AC: 4–5)

  - [ ] In `/dashboard/admin/users/page.tsx`, call `GET /api/admin/users?page=&limit=` on mount.
  - [ ] Implement loading and error states using existing UI patterns (e.g., spinners, alerts).
  - [ ] Render a table/list with columns: `numeric_user_id`, `display_name`, `email`, `role`, and **Edit**.
  - [ ] Implement pagination controls if needed based on the API response.
  - [ ] Wire **Edit** action to navigate to `/dashboard/admin/users/[id]` with the correct profile UUID.

- [ ] Implement Admin Profile Editor UI (AC: 6–8)

  - [ ] In `/dashboard/admin/users/[id]/page.tsx`, call `GET /api/admin/users/[id]` on mount.
  - [ ] Display read-only `numeric_user_id` and `email` fields.
  - [ ] Provide editable inputs for `display_name`, `avatar_url`, `twitter_url`, `instagram_url`, `facebook_url`, `youtube_url`, `tiktok_url`, `website_url`.
  - [ ] Implement **Save** button that sends `PUT /api/admin/users/[id]` with updated values.
  - [ ] Show success feedback and update local state on success; show error feedback on failure.
  - [ ] Implement **Preview** button that uses `window.open('/profile/' + id, '_blank', 'noopener,noreferrer')`.

- [ ] Ensure visual consistency and UX quality (AC: 9)
  - [ ] Use existing Tailwind + Shadcn components (buttons, tables, forms, etc.).
  - [ ] Match spacing, typography, and card/layout patterns already used in `/dashboard/profile`.
  - [ ] Add responsive behavior so admin pages render well on various screen sizes.
  - [ ] Add basic accessibility support (labels, focus states, etc.) consistent with other dashboard pages.

## Dev Notes

### Architecture Context

- This story corresponds to the **Frontend Architecture – Admin Area** section in `docs/architecture/admin-user-management-brownfield-architecture.md`:
  - New routes under `/dashboard/admin/*`.
  - Conditional navigation based on `profile.role`.
  - Admin User List and Profile Editor screens.

### UI/UX Patterns

- Reuse existing dashboard patterns:
  - Header with navigation on the left, logout on the right.
  - Card-like containers for forms and tables.
  - Existing `Button`, `Input`, `Label`, `Alert`, and `LoadingSpinner` components.

### Security Considerations

- Admin UI is an additional layer on top of:
  - `/api/admin/*` admin checks (Story 4.2).
  - RLS-based protection on `public.profiles` (Story 4.1).
- UI must never attempt to modify `role` in this iteration.

## Testing

- Manual and/or automated tests for:
  - Nav visibility for admin vs non-admin users.
  - Direct URL access to `/dashboard/admin/*` for non-admins (403/redirect behavior).
  - Loading, success, and error states for the Admin User List and Profile Editor.
  - Save and Preview interactions in the editor screen.
  - Visual and responsive behavior in common breakpoints.

## Dev Agent Record

### Agent Model Used

Cascade

### Debug Log References

1. Extended `ProfileContext` and `/api/profile` to include `role`.
2. Updated dashboard layout to conditionally show Admin nav item.
3. Implemented `/dashboard/admin/users` and `/dashboard/admin/users/[id]` pages.
4. Wired Admin pages to `/api/admin/users*` endpoints and verified admin-only behavior.
5. Verified UI consistency and basic accessibility across the new screens.

## Change Log

| Date       | Version | Description                                                   | Author |
| ---------- | ------- | ------------------------------------------------------------- | ------ |
| 2025-11-26 | 1.0     | Initial story draft for admin dashboard UI and profile editor | PM     |
