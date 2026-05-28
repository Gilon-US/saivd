"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {cn} from "@/lib/utils";

const tabs = [
  {href: "/dashboard/settings/general", label: "General"},
  {href: "/dashboard/settings/users", label: "Users"},
  {href: "/dashboard/settings/admins", label: "Admins"},
  {href: "/dashboard/settings/activity", label: "Activity"},
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3 mb-6">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-2 rounded-md text-sm font-medium",
              active
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            )}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
