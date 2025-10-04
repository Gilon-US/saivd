import { LoadingSpinner } from '@/components/ui/loading-spinner';

/**
 * Loading UI for Public Profile Page
 * 
 * Displays while the profile page is loading.
 * Story 2.3: Public Profile Page Component
 */
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-600" aria-live="polite">
          Loading profile...
        </p>
      </div>
    </div>
  );
}
