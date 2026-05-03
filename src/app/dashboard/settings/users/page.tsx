"use client";

import {useEffect, useState, useMemo} from "react";
import {useRouter} from "next/navigation";
import {useProfile} from "@/contexts/ProfileContext";
import {useAuth} from "@/contexts/AuthContext";
import {isStaffProfile, isSuperuserProfile} from "@/lib/app-role";
import {isBootstrapSuperuserEmail} from "@/lib/bootstrap-superuser";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {ChevronUp, ChevronDown, ChevronsUpDown} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AdminUserRow {
  id: string;
  numeric_user_id: number | null;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function SettingsUsersPage() {
  const {user} = useAuth();
  const {profile, loading: profileLoading, initialized} = useProfile();
  const router = useRouter();

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"display_name" | "email" | "role" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isStaff = isStaffProfile(profile, user?.email);
  const isSuperuser = isSuperuserProfile(profile, user?.email);

  const sortedUsers = useMemo(() => {
    if (!sortKey) return users;
    return [...users].sort((a, b) => {
      const av =
        sortKey === "display_name" ? (a.display_name ?? "").toLowerCase()
        : sortKey === "email" ? a.email.toLowerCase()
        : a.role.toLowerCase();
      const bv =
        sortKey === "display_name" ? (b.display_name ?? "").toLowerCase()
        : sortKey === "email" ? b.email.toLowerCase()
        : b.role.toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [users, sortKey, sortDir]);

  function handleSort(key: "display_name" | "email" | "role") {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({col}: {col: "display_name" | "email" | "role"}) {
    if (sortKey !== col) return <ChevronsUpDown className="inline ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ChevronUp className="inline ml-1 h-3 w-3" />
    ) : (
      <ChevronDown className="inline ml-1 h-3 w-3" />
    );
  }

  async function handleDelete(userId: string) {
    setBusyId(userId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {method: "DELETE"});
      const json = await res.json();
      if (!res.ok || !json.success) {
        setDeleteError(json.error?.message || json.error || "Delete failed");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRoleChange(userId: string, newRole: "admin" | "user") {
    setBusyId(userId);
    setRoleError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({role: newRole}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setRoleError(json.error?.message || json.error || "Role update failed");
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? {...u, role: newRole} : u)));
    } catch (e) {
      setRoleError(e instanceof Error ? e.message : "Role update failed");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    if (!initialized || profileLoading) return;
    if (!isStaff) {
      router.replace("/dashboard");
    }
  }, [initialized, profileLoading, isStaff, router]);

  useEffect(() => {
    if (!isStaff) return;

    const fetchUsers = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/admin/users");
        const result = await response.json();

        if (!response.ok || !result.success) {
          setError(typeof result.error === "string" ? result.error : "Failed to load users");
          return;
        }

        setUsers(result.data as AdminUserRow[]);
        setPagination(result.pagination as PaginationMeta);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load users";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isStaff]);

  if (!initialized || profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-300">You do not have permission to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-1">Users</h2>
        <p className="text-gray-600 dark:text-gray-300 text-sm">
          View and edit profile fields for all users (role changes are superuser-only).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User list</CardTitle>
        </CardHeader>
        <CardContent>
          {roleError && <p className="mb-3 text-sm text-red-500">{roleError}</p>}
          {deleteError && <p className="mb-3 text-sm text-red-500">{deleteError}</p>}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="py-2 pr-4 font-semibold">Numeric ID</th>
                    <th className="py-2 pr-4 font-semibold">
                      <button
                        onClick={() => handleSort("display_name")}
                        className="flex items-center gap-0.5 hover:text-foreground transition-colors">
                        Display name
                        <SortIcon col="display_name" />
                      </button>
                    </th>
                    <th className="py-2 pr-4 font-semibold">
                      <button
                        onClick={() => handleSort("email")}
                        className="flex items-center gap-0.5 hover:text-foreground transition-colors">
                        Email
                        <SortIcon col="email" />
                      </button>
                    </th>
                    <th className="py-2 pr-4 font-semibold">
                      <button
                        onClick={() => handleSort("role")}
                        className="flex items-center gap-0.5 hover:text-foreground transition-colors">
                        Role
                        <SortIcon col="role" />
                      </button>
                    </th>
                    <th className="py-2 pr-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((userRow) => {
                    const isBootstrap = isBootstrapSuperuserEmail(userRow.email);
                    const isBusy = busyId === userRow.id;
                    return (
                      <tr key={userRow.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 pr-4">{userRow.numeric_user_id ?? "—"}</td>
                        <td className="py-2 pr-4">{userRow.display_name || "(no display name)"}</td>
                        <td className="py-2 pr-4">{userRow.email}</td>
                        <td className="py-2 pr-4 uppercase text-xs tracking-wide">{userRow.role}</td>
                        <td className="py-2 pr-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isSuperuser && !isBootstrap && userRow.role === "user" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleRoleChange(userRow.id, "admin")}>
                                {isBusy ? <LoadingSpinner size="sm" /> : "Promote to Admin"}
                              </Button>
                            )}
                            {isSuperuser && !isBootstrap && userRow.role === "admin" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleRoleChange(userRow.id, "user")}>
                                {isBusy ? <LoadingSpinner size="sm" /> : "Demote to User"}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/dashboard/settings/users/${userRow.id}`)}>
                              Edit
                            </Button>
                            {isSuperuser && !isBootstrap && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm" disabled={isBusy}>
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete user?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete{" "}
                                      <span className="font-medium">{userRow.display_name || userRow.email}</span> and
                                      all their data. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => handleDelete(userRow.id)}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pagination && (
            <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              Page {pagination.page} of {pagination.totalPages || 1} — {pagination.total} users total
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
