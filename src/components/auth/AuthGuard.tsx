'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { supabase } from '@/lib/supabase';

type AuthGuardProps = {
  children: React.ReactNode;
  fallbackUrl?: string;
};
export function AuthGuard({ children, fallbackUrl = '/login' }: AuthGuardProps) {
  const { user, loading, refreshSession } = useAuth();
  const [directSessionCheck, setDirectSessionCheck] = useState<boolean>(false);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const router = useRouter();
  
  // Direct session check as a backup
  useEffect(() => {
    const checkSessionDirectly = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const hasSession = !!data.session;
        console.log('Direct session check:', hasSession ? 'Session found' : 'No session');
        setDirectSessionCheck(hasSession);
        
        if (hasSession && !user) {
          console.log('Session found but user not in context, refreshing...');
          await refreshSession();
        }
      } catch (error) {
        console.error('Error checking session directly:', error);
      } finally {
        setIsCheckingSession(false);
      }
    };
    
    checkSessionDirectly();
  }, [user, refreshSession]);

  useEffect(() => {
    // Only redirect if we're not loading AND we've checked the session directly
    // AND both checks confirm the user is not authenticated
    if (!loading && !isCheckingSession && !user && !directSessionCheck) {
      console.log('AuthGuard: No authenticated user detected, redirecting to login');
      
      // Preserve the current URL to redirect back after login
      const currentPath = window.location.pathname;
      const redirectUrl = new URL(fallbackUrl, window.location.origin);
      
      if (currentPath !== '/' && !currentPath.includes('/login') && !currentPath.includes('/register')) {
        redirectUrl.searchParams.set('redirectTo', currentPath);
      }
      
      // Use window.location for a hard redirect instead of router.push
      // This ensures a full page reload and proper session handling
      window.location.href = redirectUrl.pathname + redirectUrl.search;
    } else if (!loading && !isCheckingSession) {
      console.log('AuthGuard: User authenticated, showing protected content');
    }
  }, [user, directSessionCheck, loading, isCheckingSession, router, fallbackUrl]);

  if (loading || isCheckingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Only show null if both checks confirm no authenticated user
  if (!user && !directSessionCheck) {
    console.log('AuthGuard: Rendering null while redirecting');
    return null; // Will redirect in useEffect
  }

  return <>{children}</>;
}
