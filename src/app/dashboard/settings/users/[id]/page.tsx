"use client";

import {useEffect, useState, FormEvent} from "react";
import {useRouter, useParams} from "next/navigation";
import {useProfile} from "@/contexts/ProfileContext";
import {useAuth} from "@/contexts/AuthContext";
import {isStaffProfile} from "@/lib/app-role";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {LoadingSpinner} from "@/components/ui/loading-spinner";
import {Alert, AlertDescription} from "@/components/ui/alert";

interface AdminUserDetail {
  id: string;
  numeric_user_id: number | null;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  twitter_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  youtube_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  role: string;
}

interface AdminUserFormValues {
  display_name: string;
  avatar_url: string;
  twitter_url: string;
  instagram_url: string;
  facebook_url: string;
  youtube_url: string;
  tiktok_url: string;
  website_url: string;
}

export default function SettingsUserDetailPage() {
  const {user} = useAuth();
  const {profile, loading: profileLoading, initialized} = useProfile();
  const router = useRouter();
  const params = useParams<{id: string}>();
  const id = params.id;

  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [formValues, setFormValues] = useState<AdminUserFormValues>({
    display_name: "",
    avatar_url: "",
    twitter_url: "",
    instagram_url: "",
    facebook_url: "",
    youtube_url: "",
    tiktok_url: "",
    website_url: "",
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isStaff = isStaffProfile(profile, user?.email);

  useEffect(() => {
    if (!initialized || profileLoading) return;
    if (!isStaff) {
      router.replace("/dashboard");
    }
  }, [initialized, profileLoading, isStaff, router]);

  useEffect(() => {
    if (!isStaff || !id) return;

    const fetchUser = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/admin/users/${id}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          setError(typeof result.error === "string" ? result.error : "Failed to load user");
          return;
        }

        const data = result.data as AdminUserDetail;
        setUserDetail(data);
        setFormValues({
          display_name: data.display_name || "",
          avatar_url: data.avatar_url || "",
          twitter_url: data.twitter_url || "",
          instagram_url: data.instagram_url || "",
          facebook_url: data.facebook_url || "",
          youtube_url: data.youtube_url || "",
          tiktok_url: data.tiktok_url || "",
          website_url: data.website_url || "",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load user";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [id, isStaff]);

  const handleChange = (field: keyof typeof formValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const payload: Record<string, unknown> = {
        display_name: formValues.display_name.trim() || null,
        avatar_url: formValues.avatar_url.trim() || null,
        twitter_url: formValues.twitter_url.trim() || null,
        instagram_url: formValues.instagram_url.trim() || null,
        facebook_url: formValues.facebook_url.trim() || null,
        youtube_url: formValues.youtube_url.trim() || null,
        tiktok_url: formValues.tiktok_url.trim() || null,
        website_url: formValues.website_url.trim() || null,
      };

      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(typeof result.error === "string" ? result.error : "Failed to update user");
        return;
      }

      const updated = result.data as AdminUserDetail;
      setUserDetail(updated);
      setSuccessMessage("User profile updated successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update user";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    if (!userDetail?.numeric_user_id) return;
    window.open(`/profile/${userDetail.numeric_user_id}`, "_blank", "noopener,noreferrer");
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
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-300">You do not have permission to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!userDetail) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>User not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-300">The requested user could not be found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-1">Edit user</h2>
          <p className="text-gray-600 dark:text-gray-300 text-sm">Editable fields only; role changes use the Admins tab (superuser).</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/settings/users")}>
            Back to users
          </Button>
          <Button variant="secondary" onClick={handlePreview} disabled={!userDetail?.numeric_user_id}>
            Preview public profile
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <Label className="text-xs font-semibold uppercase text-gray-500">Numeric user ID</Label>
              <p className="mt-1 text-sm text-gray-800 dark:text-gray-100">
                {userDetail.numeric_user_id ?? "(not assigned)"}
              </p>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase text-gray-500">Email</Label>
              <p className="mt-1 text-sm text-gray-800 dark:text-gray-100">{userDetail.email}</p>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase text-gray-500">Role</Label>
              <p className="mt-1 text-sm uppercase tracking-wide">{userDetail.role}</p>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="mb-4">
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                value={formValues.display_name}
                onChange={handleChange("display_name")}
                placeholder="Display name"
              />
            </div>

            <div>
              <Label htmlFor="avatar_url">Avatar URL</Label>
              <Input
                id="avatar_url"
                value={formValues.avatar_url}
                onChange={handleChange("avatar_url")}
                placeholder="https://example.com/avatar.jpg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="twitter_url">Twitter URL</Label>
                <Input
                  id="twitter_url"
                  value={formValues.twitter_url}
                  onChange={handleChange("twitter_url")}
                  placeholder="https://twitter.com/username"
                />
              </div>
              <div>
                <Label htmlFor="instagram_url">Instagram URL</Label>
                <Input
                  id="instagram_url"
                  value={formValues.instagram_url}
                  onChange={handleChange("instagram_url")}
                  placeholder="https://instagram.com/username"
                />
              </div>
              <div>
                <Label htmlFor="facebook_url">Facebook URL</Label>
                <Input
                  id="facebook_url"
                  value={formValues.facebook_url}
                  onChange={handleChange("facebook_url")}
                  placeholder="https://facebook.com/username"
                />
              </div>
              <div>
                <Label htmlFor="youtube_url">YouTube URL</Label>
                <Input
                  id="youtube_url"
                  value={formValues.youtube_url}
                  onChange={handleChange("youtube_url")}
                  placeholder="https://youtube.com/@channel"
                />
              </div>
              <div>
                <Label htmlFor="tiktok_url">TikTok URL</Label>
                <Input
                  id="tiktok_url"
                  value={formValues.tiktok_url}
                  onChange={handleChange("tiktok_url")}
                  placeholder="https://www.tiktok.com/@username"
                />
              </div>
              <div>
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  value={formValues.website_url}
                  onChange={handleChange("website_url")}
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => router.push("/dashboard/settings/users")}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
