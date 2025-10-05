"use client";

import {useEffect} from "react";
import {useRouter} from "next/navigation";
import {useAuth} from "@/contexts/AuthContext";
import {Button} from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const {user, loading} = useAuth();

  // Redirect authenticated users to the video grid dashboard
  useEffect(() => {
    if (user && !loading) {
      router.push("/dashboard/videos");
    }
  }, [user, loading, router]);

  // No file handling needed as we're restricting upload to authenticated users only

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">SAIVD App</h1>
          <p className="text-xl text-gray-600">Upload your files to Wasabi Cloud Storage</p>
        </div>

        {/* Show login button if not authenticated */}
        {!loading && !user ? (
          <div className="text-center mb-8">
            <Button asChild className="mr-4">
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/register">Register</Link>
            </Button>
          </div>
        ) : null}

        {/* No file uploader for non-authenticated users */}

        <div className="mt-12 text-center text-sm text-gray-500">
          <p>Built with Next.js, Shadcn UI, and Wasabi Cloud Storage</p>
        </div>
      </div>
    </div>
  );
}
