# Superuser break-glass

Use only when the superuser account cannot sign in or `set_user_role` cannot be used.

1. Connect with the **database service role** (or Supabase SQL editor as a privileged role that bypasses RLS and the role-change trigger).
2. Confirm the auth user exists in `auth.users` and note `id`.
3. Prefer updating the existing profile row:

```sql
UPDATE public.profiles
   SET role = 'superuser', updated_at = NOW()
 WHERE id = '<auth-user-uuid>';
```

4. If no profile row exists, inspect `\d public.profiles` and insert the minimum required columns, or use `ON CONFLICT (id) DO UPDATE` as appropriate for your schema.
5. Verify `SELECT COUNT(*) FROM public.profiles WHERE role = 'superuser';` returns `1`.
6. Insert a manual row into `admin_audit_log` describing the incident, then rotate credentials.
