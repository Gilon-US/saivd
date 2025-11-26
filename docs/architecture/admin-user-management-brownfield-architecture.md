# Admin User Management – Brownfield Architecture

## 1. Context & Goals

This document specifies a brownfield extension to the existing SAVD App architecture to introduce an **ADMIN area** for managing user profiles.

The key goals are:

- **Introduce a `role` field on `profiles`** to distinguish `admin` vs `user`.
- **Expose an ADMIN section** in the dashboard, visible only to admin users.
- **Provide an Admin User List** backed by the `profiles` table.
- **Provide an Admin Profile Editor** for limited profile fields.
- **Allow preview of a user’s public profile** from the admin UI.
- Maintain **security, RLS guarantees, and architectural consistency** with existing docs.

This is a **brownfield change**: we integrate into the existing Supabase schema, RLS policies, React contexts, and Next.js App Router without breaking current behavior.

---

## 2. Domain & Requirements

### 2.1 Roles

- **`admin`**
  - Can see the ADMIN navigation entry.
  - Can access all ADMIN routes and APIs.
  - Can list user profiles and edit allowed fields.
- **`user`**
  - Regular application user.
  - Cannot see ADMIN navigation.
  - Cannot access ADMIN routes or APIs.

### 2.2 Admin UI Scope (Initial)

1. **Admin Dashboard Entry**

   - New top-level navigation item under the authenticated dashboard:
     - Label: `Admin`
     - Route: `/dashboard/admin`
   - Only visible when the current user’s profile `role = 'admin'`.

2. **Admin User List**

   - Route: `/dashboard/admin/users` (initial landing for `/dashboard/admin`).
   - Backed by the `profiles` table.
   - Columns (initial minimum):
     - `numeric_user_id`
     - `display_name`
     - Optionally `email` (useful for admins)
     - Actions column with **Edit** icon button for each row.
   - Supports basic paging in the API and list UI (page/limit query params).

3. **Admin Profile Editor**

   - Route: `/dashboard/admin/users/[id]` where `[id]` is the **profile UUID** (`profiles.id`).
   - Functionality:
     - Fetch profile by ID using an admin-specific API endpoint.
     - Simple, single-column form styled like existing dashboard/profile forms.
   - Editable fields (write scope):
     - `display_name`
     - `avatar_url`
     - `twitter_url`
     - `instagram_url`
     - `facebook_url`
     - `youtube_url`
     - `tiktok_url`
     - `website_url`
   - Non-editable but useful context fields:
     - `numeric_user_id` (read-only)
     - `email` (read-only)

4. **Public Profile Preview**
   - On the Admin Profile Editor screen, add a **Preview** button.
   - Behavior:
     - Opens the user’s **public profile page** in a **new browser tab**.
     - Uses the existing public profile route: `/profile/[userId]` where `userId` is the user’s **UUID** (`profiles.id`).
   - This reuses the architecture defined in `public-user-profile-feature.md`.

### 2.3 Non-Goals (for this iteration)

- Managing or editing the `role` field from the UI (admin role assignment will be handled manually or by a future feature).
- Deleting users or deactivating accounts.
- Advanced filtering/search on the user list (can be added later).

---

## 3. Data Model Changes

### 3.1 `profiles` Table – Add `role`

**Location:** `supabase/migrations/add_role_to_profiles.sql` (new migration) and `src/db/schema/profiles.sql`.

#### 3.1.1 Schema Extension

```sql
-- Add role column with default 'user'
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

COMMENT ON COLUMN public.profiles.role IS 'Application-level role: admin or user';

-- Optional: index for role-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
```

#### 3.1.2 Updated DDL in `src/db/schema/profiles.sql`

The canonical schema file should be updated to include `role`:

```sql
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  -- Stable numeric surrogate key for external services and public URLs
  numeric_user_id BIGSERIAL UNIQUE,
  -- URL fields for user social profiles (all optional)
  twitter_url TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  youtube_url TEXT,
  tiktok_url TEXT,
  website_url TEXT,
  -- Application-level role: admin or user
  role TEXT NOT NULL DEFAULT 'user',
  -- RSA keypair for this user (backend-only, never exposed via public APIs)
  rsa_public TEXT,
  rsa_private TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3.1.3 Trigger Behavior

The existing trigger `public.handle_new_user()` inserts into `profiles` when a new `auth.users` record is created. With the `role` field defaulting to `user`, **no trigger changes are needed** for standard signups:

- All new users implicitly get `role = 'user'`.
- Admin users will be created by **manually updating** the `role` field to `admin` via SQL or Supabase Studio until an "admin role management" feature is implemented.

---

## 4. Authorization & RLS Model

### 4.1 Current Policies

`profiles` currently has RLS policies to:

- Allow users to **view and update their own profile**.
- Allow **public read** for the limited public profile API (for `/profile/[userId]`).

### 4.2 Admin Access Pattern

We want **admin users** to be able to **read and update other users’ profiles** via the ADMIN APIs, while preserving existing guarantees:

- Regular users still can only update their own profiles.
- Public read access remains limited to the fields and routes described in `public-user-profile-feature.md`.

### 4.3 RLS Policy Adjustments

We extend the `profiles` policies to recognize `role = 'admin'` using a self-join on `profiles`:

```sql
-- Allow authenticated users to view their own profile OR any profile if they are admin
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view profiles (self or admin)"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p_admin
      WHERE p_admin.id = auth.uid()
        AND p_admin.role = 'admin'
    )
  );

-- Allow authenticated users to update their own profile, or any profile if admin
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update profiles (self or admin)"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p_admin
      WHERE p_admin.id = auth.uid()
        AND p_admin.role = 'admin'
    )
  );
```

Notes:

- The existing public-read policy for limited fields **remains** for the public profile endpoint.
- The above policies apply to **all SELECT/UPDATE** from authenticated contexts (including ADMIN APIs). The API layer will further restrict which fields are writable.

### 4.4 API-Level Authorization Guard

In addition to RLS, all **`/api/admin/*`** routes will:

1. Use `createClient()` with the standard anon key (no service role key).
2. Fetch the current user via `supabase.auth.getUser()`.
3. Query `profiles` for the current user and verify `role = 'admin'`.
4. Return **403 Forbidden** if not admin.

This gives us **defense in depth**:

- API layer rejects non-admins early.
- RLS still prevents unauthorized access if an API bug appears.

---

## 5. API Design – Admin Endpoints

### 5.1 Base Path

All ADMIN-related endpoints will live under:

- `/api/admin/users` – collection and list operations
- `/api/admin/users/[id]` – operations on a specific user profile (`id` = `profiles.id` UUID)

### 5.2 GET `/api/admin/users`

**Purpose:** List user profiles for the Admin User List.

**Query parameters:**

- `page` – 1-based page index (default: 1)
- `limit` – page size (default: 20, max: 100)

**Data source:** `public.profiles`.

**Selected fields:**

- `id`
- `numeric_user_id`
- `display_name`
- `email`
- `avatar_url`
- `role`

**Response shape (example):**

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

### 5.3 GET `/api/admin/users/[id]`

**Purpose:** Fetch full profile data needed for the Admin Profile Editor.

**Path param:**

- `id` – UUID of the target profile.

**Selected fields:**

- `id`
- `numeric_user_id`
- `email`
- `display_name`
- `avatar_url`
- `twitter_url`
- `instagram_url`
- `facebook_url`
- `youtube_url`
- `tiktok_url`
- `website_url`
- `role`

**Error handling:**

- `404` if profile not found.
- `400` if invalid UUID.

### 5.4 PUT `/api/admin/users/[id]`

**Purpose:** Update a subset of profile fields for a specific user.

**Writable fields:**

- `display_name`
- `avatar_url`
- `twitter_url`
- `instagram_url`
- `facebook_url`
- `youtube_url`
- `tiktok_url`
- `website_url`

**Validation examples:**

- `display_name`: optional, 2–50 characters when present.
- URL fields: basic URL format validation and max length.

**Server-side behavior:**

- Verify current user is admin.
- Validate body.
- Call `update` on `profiles` with only allowed fields plus `updated_at = now()`.
- Return sanitized profile object.

**Non-goal:** modifying `role` here (future feature may add explicit endpoint and stricter authorization).

---

## 6. Frontend Architecture – Admin Area

### 6.1 Routing & Layout

Leverage the existing dashboard layout at `src/app/dashboard/layout.tsx`.

**New routes (App Router):**

- `src/app/dashboard/admin/page.tsx` → simple redirect or wrapper to `/dashboard/admin/users`.
- `src/app/dashboard/admin/users/page.tsx` → Admin User List.
- `src/app/dashboard/admin/users/[id]/page.tsx` → Admin Profile Editor.

All of these routes should be wrapped in the existing **AuthGuard / dashboard protection** so only authenticated users can reach them, with additional in-component guards for admin role.

### 6.2 Navigation Changes

In `src/app/dashboard/layout.tsx`, extend the header nav:

- Fetch current profile via `ProfileContext` (see below).
- Conditionally render the `Admin` nav item when `profile.role === 'admin'`.
- Ensure no admin nav is rendered for non-admins.

### 6.3 Profile Context Extension

Update `src/contexts/ProfileContext.tsx`:

1. Extend the `Profile` interface to include:

   ```ts
   role: string; // 'admin' | 'user' (string for compatibility with DB)
   ```

2. Ensure `/api/profile` GET selects `role` and returns it to the client.
3. Keep `updateProfile` limited to user-editable fields (no `role` changes) to align with RLS and requirements.

This gives the frontend a single source of truth for **current user role** used by:

- Dashboard navigation (show/hide Admin).
- Admin routes/components (client-side guards).

### 6.4 Admin User List Screen

**Component responsibilities:**

- Fetch `/api/admin/users?page=&limit=`.
- Display table with columns:
  - `numeric_user_id`
  - `display_name`
  - `email`
  - `role`
  - Actions (`Edit` icon button).
- Clicking `Edit` navigates to `/dashboard/admin/users/[id]`.

**Styling:**

- Use existing design system: Tailwind + Shadcn table/button components.
- Follow spacing/typography from dashboard pages (e.g., `container`, `card`, `shadow`, etc.).

### 6.5 Admin Profile Editor Screen

**Responsibilities:**

- On mount, fetch `/api/admin/users/[id]`.
- Populate a form with editable and read-only fields.
- Handle validation errors returned from the API.
- Provide **Save** and **Preview** actions.

**Layout:**

- Centered card or max-width container consistent with `/dashboard/profile` UI.
- Single-column form fields with labels and helper text.

**Form fields:**

- Read-only: `numeric_user_id`, `email`.
- Editable: `display_name`, `avatar_url`, `twitter_url`, `instagram_url`, `facebook_url`, `youtube_url`, `tiktok_url`, `website_url`.

**Preview button:**

- Uses `window.open(`/profile/${id}`, '_blank', 'noopener,noreferrer')` where `id` is the **profile UUID**.
- This aligns with the public profile architecture: `/profile/[userId]`.

**Client-side guard:**

- If `profile.role !== 'admin'`, show a friendly **403** message and/or redirect back to `/dashboard`.

---

## 7. Security & Access Control

### 7.1 Defense-in-Depth

- **Route Protection:**

  - `/dashboard/admin/*` lives under the authenticated dashboard and reuses `AuthGuard`.
  - Components verify `profile.role === 'admin'`.

- **API Guard:**

  - `/api/admin/*` endpoints check the caller’s role via the `profiles` table.

- **RLS Policies:**
  - RLS ensures only admins or owners can see/update profiles even if an API bug occurs.

### 7.2 Threat Considerations

- **Direct URL Access:**

  - Non-admin users attempting to hit `/dashboard/admin/...` directly will be blocked client-side and receive `403` from `/api/admin/*`.

- **Token Theft / Session Hijack:**

  - Inherits existing auth hardening (Supabase session handling, AuthGuard behavior).

- **Elevation of Privilege:**
  - No UI or API currently exposes `role` changes.
  - Admin role assignment remains a manual DB operation for now.

---

## 8. Migration & Rollout Plan

### 8.1 Database

1. Create migration: `supabase/migrations/add_role_to_profiles.sql` with:
   - `ALTER TABLE` to add `role`.
   - `COMMENT` and `INDEX`.
   - Updated RLS policies for admin access.
2. Update `src/db/schema/profiles.sql` to be the canonical schema including `role`.
3. Run and verify migrations in dev and staging.

### 8.2 Backend

1. Implement `/api/admin/users` and `/api/admin/users/[id]` routes.
2. Update `/api/profile` GET handler to include `role` in the selected columns.
3. Ensure tests cover:
   - Non-admin access to `/api/admin/*` → `403`.
   - Admin can read/update other users.
   - RLS behavior matches expectations.

### 8.3 Frontend

1. Extend `ProfileContext` with `role` and wire to updated `/api/profile` response.
2. Update `dashboard` layout to show `Admin` nav item when `role === 'admin'`.
3. Implement Admin User List and Admin Profile Editor pages.
4. Wire up **Preview** to open `/profile/[userId]` in a new tab.

### 8.4 Testing

- **Unit & Integration Tests:**
  - API tests for `/api/admin/*` including role checks.
- **E2E Tests:**
  - As `user` cannot view `Admin` nav or access `/dashboard/admin/*`.
  - As `admin` can list users, edit allowed fields, and preview public profile.
- **Security Tests:**
  - Verify RLS behavior with SQL queries.
  - Attempt direct access to `/api/admin/*` with non-admin user tokens.

---

## 9. Future Enhancements

- Admin UI for **promoting/demoting roles** (`user` ⇄ `admin`) with stricter safeguards.
- Advanced filtering/search on the Admin User List (by email, role, signup date, etc.).
- Audit logging for admin changes to user profiles.
- Bulk operations (e.g., batch updates to social links).

This document should be used as the implementation blueprint for introducing the ADMIN page, role field, and user management workflows into the existing SAVD App architecture.
