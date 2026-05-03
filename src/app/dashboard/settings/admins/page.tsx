"use client";

import {useCallback, useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {useProfile} from "@/contexts/ProfileContext";
import {useAuth} from "@/contexts/AuthContext";
import {effectiveProfileRole, isStaffProfile, isSuperuserProfile} from "@/lib/app-role";
import {BOOTSTRAP_SUPERUSER_EMAIL, isBootstrapSuperuserEmail} from "@/lib/bootstrap-superuser";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {Alert, AlertDescription} from "@/components/ui/alert";

interface ProfileSummary {
  id: string;
  numeric_user_id: number | null;
  display_name: string | null;
  email: string;
  role: string;
}

interface AdminsPayload {
  superuser: ProfileSummary | null;
  admins: ProfileSummary[];
  adminCount: number;
  adminCap: number;
}

export default function SettingsAdminsPage() {
  const {user} = useAuth();
  const {profile, loading: profileLoading, initialized, refreshProfile} = useProfile();
  const router = useRouter();
  const [data, setData] = useState<AdminsPayload | null>(null);
  const [users, setUsers] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isStaff = isStaffProfile(profile, user?.email);
  const isSuperuser = isSuperuserProfile(profile, user?.email);

  const load = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    setError(null);
    try {
      const [admRes, usersRes] = await Promise.all([fetch("/api/admin/admins"), fetch("/api/admin/users?limit=100")]);
      const admJson = await admRes.json();
      const usersJson = await usersRes.json();
      if (!admRes.ok || !admJson.success) {
        setError(typeof admJson.error === "string" ? admJson.error : "Failed to load admins");
        setData({superuser: null, admins: [], adminCount: 0, adminCap: 3});
        return;
      }
      setData(admJson.data as AdminsPayload);
      if (usersRes.ok && usersJson.success) {
        setUsers((usersJson.data as ProfileSummary[]) || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    if (!initialized || profileLoading) return;
    if (!isStaff) {
      setLoading(false);
      router.replace("/dashboard");
      return;
    }
    void load();
  }, [initialized, profileLoading, isStaff, router, load]);

  const postRole = async (userId: string, role: "user" | "admin" | "superuser") => {
    setBusyId(userId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({role}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const msg = json.error?.message || json.error || "Role update failed";
        setError(String(msg));
        return;
      }
      await load();
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Role update failed");
    } finally {
      setBusyId(null);
    }
  };

  if (!initialized || profileLoading || loading) {
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
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-300">You do not have permission to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const promotable = users.filter(
    (u) =>
      u.role !== "admin" &&
      u.role !== "superuser" &&
      !isBootstrapSuperuserEmail(u.email)
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-1">Admins</h2>
        <p className="text-gray-600 dark:text-gray-300 text-sm">
          Superuser can promote or demote admins (max {data.adminCap}). You are signed in as{" "}
          <span className="font-medium">{profile?.email ?? user?.email}</span> ({effectiveProfileRole(profile, user?.email)}).
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Superuser</CardTitle>
        </CardHeader>
        <CardContent>
          {data.superuser ? (
            <div className="text-sm space-y-1">
              <p>
                <span className="font-medium">{data.superuser.email}</span> — numeric ID{" "}
                {data.superuser.numeric_user_id ?? "—"}
              </p>
              <p className="text-gray-500">Role changes for this account are restricted by policy.</p>
            </div>
          ) : (
            <p className="text-sm text-amber-600">
              No profile row for {BOOTSTRAP_SUPERUSER_EMAIL} (and no role=superuser in the database). Sign in once with
              that account so a profile exists, or apply migrations.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Admins ({data.adminCount}/{data.adminCap})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.admins.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">No admins yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.admins.map((a) => (
                <li key={a.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">{a.display_name || a.email}</div>
                    <div className="text-gray-500">{a.email}</div>
                  </div>
                  {isSuperuser ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === a.id}
                      onClick={() => void postRole(a.id, "user")}>
                      {busyId === a.id ? "…" : "Demote to user"}
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-500">Superuser only</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isSuperuser && (
        <Card>
          <CardHeader>
            <CardTitle>Promote to admin</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              Users listed from the first page of directory (up to 100). If someone is missing, use Admin → Users or
              raise the API limit later.
            </p>
            {data.adminCount >= data.adminCap ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Admin cap is {data.adminCap}. Demote an admin before promoting another.
              </p>
            ) : promotable.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">No eligible users on this page.</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {promotable.map((u) => (
                  <li key={u.id} className="py-3 flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <div className="font-medium">{u.display_name || u.email}</div>
                      <div className="text-gray-500">{u.email}</div>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={busyId === u.id || data.adminCount >= data.adminCap}
                      onClick={() => void postRole(u.id, "admin")}>
                      {busyId === u.id ? "…" : "Promote to admin"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
