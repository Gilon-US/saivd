import {ReactNode} from "react";
import {redirect} from "next/navigation";
import {requireStaff} from "@/utils/auth-roles";
import {SettingsNav} from "@/components/settings/SettingsNav";

export default async function SettingsLayout({children}: {children: ReactNode}) {
  const {error} = await requireStaff();
  if (error) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Staff tools for user management and activity.</p>
      </div>
      <SettingsNav />
      {children}
    </div>
  );
}
