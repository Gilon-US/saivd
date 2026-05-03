"use client";

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {useProfile} from "@/contexts/ProfileContext";
import {useAuth} from "@/contexts/AuthContext";
import {isStaffProfile} from "@/lib/app-role";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {LoadingSpinner} from "@/components/ui/loading-spinner";

interface AuditRow {
  id: number;
  actor_id: string;
  action: string;
  target_id: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export default function SettingsActivityPage() {
  const {user} = useAuth();
  const {profile, loading: profileLoading, initialized} = useProfile();
  const router = useRouter();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isStaff = isStaffProfile(profile, user?.email);

  useEffect(() => {
    if (!initialized || profileLoading) return;
    if (!isStaff) {
      router.replace("/dashboard");
    }
  }, [initialized, profileLoading, isStaff, router]);

  useEffect(() => {
    if (!isStaff) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/audit?limit=80");
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError(typeof json.error === "string" ? json.error : "Failed to load activity");
          return;
        }
        setRows((json.data as AuditRow[]) || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load activity");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [isStaff]);

  if (!initialized || profileLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isStaff) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-1">Activity</h2>
        <p className="text-gray-600 dark:text-gray-300 text-sm">Recent staff actions (role changes and profile edits).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">No entries yet.</p>
          ) : (
            <div className="overflow-x-auto text-sm">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Actor</th>
                    <th className="py-2 pr-3">Target</th>
                    <th className="py-2 pr-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">{r.action}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.actor_id.slice(0, 8)}…</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.target_id ? `${r.target_id.slice(0, 8)}…` : "—"}</td>
                      <td className="py-2 pr-3 max-w-md break-words text-xs text-gray-600 dark:text-gray-400">
                        <pre className="whitespace-pre-wrap font-mono">
                          {JSON.stringify({before: r.before, after: r.after}, null, 0)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
