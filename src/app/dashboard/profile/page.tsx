"use client";

import Link from "next/link";
import { UserProfile } from "@/components/auth/UserProfile";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  return (
    <ProfileProvider>
      <div className="container mx-auto py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Profile Settings</h1>
              <p className="text-gray-500 dark:text-gray-400">
                Manage your account information and preferences
              </p>
            </div>
            <Button asChild>
              <Link href="/dashboard/profile/edit">Edit profile</Link>
            </Button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <UserProfile />
          </div>
        </div>
      </div>
    </ProfileProvider>
  );
}
