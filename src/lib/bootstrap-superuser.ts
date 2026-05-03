/**
 * Canonical platform owner: always treated as superuser for UI and API gates,
 * regardless of the `profiles.role` column. Promote/demote the three admins
 * only via Settings → Admins (no ad-hoc SQL for admin roles).
 */
export const BOOTSTRAP_SUPERUSER_EMAIL = "elon@saivd.io";

export function normalizeBootstrapEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isBootstrapSuperuserEmail(email: string | null | undefined): boolean {
  return normalizeBootstrapEmail(email) === normalizeBootstrapEmail(BOOTSTRAP_SUPERUSER_EMAIL);
}

/** Overlay superuser role on API responses for the bootstrap account only. */
export function profileWithBootstrapSuperuserRole<T extends {email?: string | null; role?: string | null}>(
  row: T
): T {
  if (!isBootstrapSuperuserEmail(row.email)) return row;
  return {...row, role: "superuser"};
}
