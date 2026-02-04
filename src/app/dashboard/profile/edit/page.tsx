"use client";

import { ProfileEditorForm } from "@/components/profile/ProfileEditorForm";

export default function ProfileEditPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <ProfileEditorForm />
        </div>
      </div>
    </div>
  );
}
