"use client";

import {redirect} from "next/navigation";

export default function AdminIndexPage() {
  // Simple redirect to the main admin users list
  redirect("/dashboard/admin/users");
  return null;
}
