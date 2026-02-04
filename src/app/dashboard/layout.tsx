"use client";

import {ReactNode} from "react";
import Link from "next/link";
import {LogoutButton} from "@/components/auth/LogoutButton";
import {ProfileProvider, useProfile} from "@/contexts/ProfileContext";

interface DashboardLayoutProps {
  children: ReactNode;
}

function DashboardShell({children}: DashboardLayoutProps) {
  const {profile} = useProfile();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col">
        <header className="bg-white dark:bg-gray-800 shadow">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="text-xl font-bold">
                SAIVD
              </Link>
              <nav className="hidden md:flex space-x-4">
                <Link href="/dashboard" className="px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/profile"
                  className="px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                  Profile
                </Link>
                <Link
                  href="/dashboard/profile/edit"
                  className="px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                  Edit profile
                </Link>
                {isAdmin && (
                  <Link
                    href="/dashboard/admin/users"
                    className="px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                    Admin
                  </Link>
                )}
              </nav>
            </div>
            <div>
              <LogoutButton variant="ghost" size="sm" showIcon={true} />
            </div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
        <footer className="bg-white dark:bg-gray-800 shadow-inner py-4">
          <div className="container mx-auto px-4 text-center text-sm text-gray-500">
            © {new Date().getFullYear()} SAIVD App. All rights reserved.
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function DashboardLayout({children}: DashboardLayoutProps) {
  return (
    <ProfileProvider>
      <DashboardShell>{children}</DashboardShell>
    </ProfileProvider>
  );
}
