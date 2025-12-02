"use client";

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {useProfile} from "@/contexts/ProfileContext";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {LoadingSpinner} from "@/components/ui/loading-spinner";

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

export default function AdminUsersPage() {
  const {profile, loading: profileLoading, initialized} = useProfile();
  const router = useRouter();

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!initialized || profileLoading) return;
    if (!isAdmin) {
      // Non-admins should not access this page; redirect back to dashboard
      router.replace("/dashboard");
    }
  }, [initialized, profileLoading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchUsers = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/admin/users");
        const result = await response.json();

        if (!response.ok || !result.success) {
          setError(result.error || "Failed to load users");
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
  }, [isAdmin]);

  if (!initialized || profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
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
    <div className="container mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Admin - Users</h1>
        <p className="text-gray-600 dark:text-gray-300 text-sm">
          View and manage basic profile information for all users.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User List</CardTitle>
        </CardHeader>
        <CardContent>
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
                    <th className="py-2 pr-4 font-semibold">Display Name</th>
                    <th className="py-2 pr-4 font-semibold">Email</th>
                    <th className="py-2 pr-4 font-semibold">Role</th>
                    <th className="py-2 pr-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((userRow) => (
                    <tr key={userRow.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-4">{userRow.numeric_user_id ?? "—"}</td>
                      <td className="py-2 pr-4">{userRow.display_name || "(no display name)"}</td>
                      <td className="py-2 pr-4">{userRow.email}</td>
                      <td className="py-2 pr-4 uppercase text-xs tracking-wide">{userRow.role}</td>
                      <td className="py-2 pr-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/dashboard/admin/users/${userRow.id}`)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
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
