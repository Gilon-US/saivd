# Admin User Management - Brownfield Enhancement

## Epic Title

Admin User Management & Role-Based Access - Brownfield Enhancement

## Epic Goal

Introduce a lightweight ADMIN area that allows designated admin users to view and edit basic profile metadata for all users (using the existing `profiles` table), while enforcing clear role-based access control and maintaining existing security/RLS guarantees.

## Epic Description

### Existing System Context

- **Current relevant functionality:**
  - Authenticated users have profiles stored in `public.profiles` (Supabase Postgres) and managed via `/api/profile` and `ProfileContext`.
  - Public user profiles are viewable via `/profile/[userId]` as defined in `public-user-profile-feature.md`.
  - The authenticated experience is organized under `/dashboard` with layout and navigation defined in `src/app/dashboard/layout.tsx`.
  - Row-Level Security (RLS) is in place on `profiles` so users can only view/update their own profile, plus a public-read policy for limited public profile fields.
- **Technology stack:**
  - Next.js App Router (TypeScript, React, client + server components).
  - Supabase (auth, Postgres, RLS, migrations).
  - Tailwind CSS + Shadcn UI for styling.
- **Integration points:**
  - Database: `public.profiles` table and its RLS policies.
  - Backend: existing `/api/profile` route and new `/api/admin/users*` routes.
  - Frontend: `ProfileContext`, `AuthContext`, `/dashboard` layout and routes, and public profile routes under `/profile/[userId]`.

### Enhancement Details

- **What's being added/changed:**
  - Add a `role` field to `public.profiles` with values `admin` or `user` and default `user`.
  - Extend RLS policies on `profiles` so `admin` users can read and update other users’ profiles, while regular users remain scoped to self.
  - Introduce **ADMIN-specific API endpoints** under `/api/admin/users` and `/api/admin/users/[id]` for:
    - Listing user profiles (for an admin user list).
    - Fetching a single profile by ID for editing.
    - Updating a constrained subset of profile fields (display name, avatar URL, social links).
  - Extend the frontend dashboard:
    - Add an **Admin** nav item in the dashboard header, visible only for users with `profile.role === 'admin'`.
    - Create an **Admin User List** screen at `/dashboard/admin/users`.
    - Create an **Admin Profile Editor** screen at `/dashboard/admin/users/[id]` with a preview link to the user’s public profile.
- **How it integrates:**
  - Leverages the existing `profiles` table as the single source of truth for user metadata.
  - Reuses `ProfileContext` to surface the current user’s `role` to the frontend for navigation and UI guards.
  - Uses new `/api/admin/*` routes layered on top of existing Supabase RLS for defense-in-depth.
  - Connects the Admin Profile Editor to the existing public profile flow by using the `id` UUID in `/profile/[userId]` URLs.
- **Success criteria:**
  - Only users with `role = 'admin'` see the Admin nav item and can successfully call `/api/admin/*` endpoints.
  - Admins can view a paginated list of user profiles and click through to edit allowed fields.
  - Changes to `display_name`, `avatar_url`, and social URLs persist correctly and are reflected in relevant parts of the app (e.g., public profile page where applicable).
  - Non-admin users cannot access `/dashboard/admin/*` or `/api/admin/*` (receive 403 / are redirected) even via direct URL navigation.
  - Existing non-admin behavior for profiles and public profile viewing remains unchanged.

## Stories

1. **Story 1: Add Role Field and Admin-Aware RLS to Profiles**  
   Implement the `role` column on `public.profiles` and update RLS so that admin users can view/update all profiles, while regular users remain restricted to their own records.

2. **Story 2: Expose Admin User Management APIs**  
   Create `/api/admin/users` and `/api/admin/users/[id]` endpoints that enforce admin-only access and provide list and edit capabilities for the limited set of editable profile fields.

3. **Story 3: Implement Admin UI (Nav, User List, Profile Editor & Preview)**  
   Extend the dashboard UI to show an Admin nav item for admins, render an Admin User List and Profile Editor screens, and add a preview button that opens the target user’s public profile in a new tab.

## Compatibility Requirements

- [ ] Existing public APIs and public profile behavior (`/profile/[userId]`) remain unchanged.
- [ ] Database changes to `public.profiles` (`role` column, indexes, and RLS adjustments) are backward compatible with existing data and triggers.
- [ ] UI components for the admin area reuse existing layout, styling, and component patterns (Tailwind + Shadcn + dashboard layout).
- [ ] Performance impact on profile queries (including admin listing) is minimal and acceptable for current scale.

## Risk Mitigation

- **Primary Risk:** Misconfigured RLS or admin checks could allow non-admin users to read or modify other users’ profiles, or could block legitimate admin operations.
- **Mitigation:**
  - Implement admin checks in **both** API layer and RLS policies (defense-in-depth).
  - Add integration tests that explicitly verify behavior for `user` vs `admin` roles across `/api/admin/*` and `/api/profile`.
  - Verify RLS manually in Supabase by attempting queries as different roles.
- **Rollback Plan:**
  - Database: revert the `add_role_to_profiles` migration (drop the `role` column and revert RLS to prior state) or temporarily disable admin-aware RLS while leaving the column in place.
  - Backend/Frontend: feature-flag or comment out `/api/admin/*` routes and admin UI navigation, restoring previous behavior without admin features.

## Definition of Done

- [ ] All three stories are implemented with clear, testable acceptance criteria.
- [ ] Existing profile and public profile functionality is regression-tested and works as before for non-admin users.
- [ ] Admin users can:
  - See the Admin nav item.
  - List users and open individual profiles via the Admin UI.
  - Edit only the allowed fields and see changes persist.
  - Open the target user’s public profile in a new tab from the Admin Profile Editor.
- [ ] Non-admin users cannot access `/dashboard/admin/*` or `/api/admin/*`, even with direct URL access.
- [ ] Documentation is updated:
  - Architecture doc: `docs/architecture/admin-user-management-brownfield-architecture.md` (already created).
  - Epic doc: this file, referenced from planning/roadmap as needed.
- [ ] No regressions or unexpected changes in existing dashboards, video workflows, or authentication flows.

## Validation Checklist

### Scope Validation

- [ ] Epic can be completed in 1–3 stories (see Stories section above).
- [ ] No additional architectural documentation is required beyond the existing admin architecture doc.
- [ ] Enhancement follows existing tech and UX patterns (Supabase, Next.js App Router, Tailwind/Shadcn, RLS-based auth).
- [ ] Integration with existing profile and public profile flows is straightforward and localized.

### Risk Assessment

- [ ] Risk to existing system is low to moderate and manageable through RLS + API checks and tests.
- [ ] Rollback plan for DB and code is documented and feasible.
- [ ] Testing strategy explicitly covers admin vs non-admin behavior and public vs private profile access.
- [ ] Team has sufficient understanding of current auth/profile and dashboard implementations to integrate safely.

### Completeness Check

- [ ] Epic goal is clear, user value is articulated (admin user management and oversight).
- [ ] Stories are properly scoped and can be implemented independently but cohesively.
- [ ] Success criteria are measurable (e.g., access control tests, ability to perform specific admin flows).
- [ ] Dependencies are identified (Supabase migrations, RLS configuration, existing `/api/profile` and `ProfileContext`, dashboard layout).

## Story Manager Handoff

"Please develop detailed user stories for this brownfield epic. Key considerations:

- This is an enhancement to an existing system running Next.js App Router (TypeScript/React), Supabase (auth, Postgres, RLS), and Tailwind/Shadcn UI.
- Integration points:
  - `public.profiles` table and its RLS policies.
  - Existing `/api/profile` and new `/api/admin/users*` routes.
  - `ProfileContext` and `/dashboard` layout/nav, plus public profile routes `/profile/[userId]`.
- Existing patterns to follow:
  - RLS + API-layer authorization for access control.
  - Dashboard and profile UX patterns for layout/styling.
  - Existing public profile feature for viewing profiles by user ID.
- Critical compatibility requirements:
  - Preserve existing profile behavior for regular users.
  - Maintain backward-compatible DB and API behavior.
  - Ensure performance impact on profile queries is minimal.

The epic should maintain system integrity while delivering a secure, role-based Admin User Management capability that allows admins to list users, edit selected profile fields, and preview public profiles without impacting regular user flows."
