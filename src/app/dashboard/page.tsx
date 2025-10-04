import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoIcon, HardDriveIcon, UploadIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Dashboard | SAVD',
  description: 'SAVD Dashboard',
};

export default function DashboardPage() {
  // Redirect to videos page based on the latest user story implementation
  redirect('/dashboard/videos');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Welcome to your dashboard. Manage your videos and account.
        </p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Your Videos</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  Manage your uploaded videos
                </p>
              </div>
              <div className="bg-primary/10 p-2 rounded-full">
                <VideoIcon className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="mt-6">
              <Button asChild>
                <Link href="/dashboard/videos">
                  View Videos
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Upload Video</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  Upload a new video to your account
                </p>
              </div>
              <div className="bg-primary/10 p-2 rounded-full">
                <UploadIcon className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="mt-6">
              <Button asChild>
                <Link href="/dashboard/upload">
                  Upload New Video
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Storage Usage</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  Monitor your storage quota
                </p>
              </div>
              <div className="bg-primary/10 p-2 rounded-full">
                <HardDriveIcon className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span>Used</span>
                <span className="font-medium">0 MB</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 h-2 rounded-full mt-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: '0%' }}></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
