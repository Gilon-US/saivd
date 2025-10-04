'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { User, AuthError, Session } from '@supabase/supabase-js';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Function to refresh the session
  const refreshSession = async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('Error refreshing session:', error);
        // If refresh fails, we might need to clear the session
        setUser(null);
        setSession(null);
      } else {
        setUser(data.user);
        setSession(data.session);
      }
    } catch (err) {
      console.error('Unexpected error refreshing session:', err);
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check for existing session
    const initializeAuth = async () => {
      try {
        // Create Supabase client
        const supabase = createClient();
        
        // Get current session
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        setUser(currentSession?.user || null);
        setSession(currentSession);
        
        // If session exists but is close to expiry, refresh it
        if (currentSession && isSessionNearExpiry(currentSession)) {
          await refreshSession();
        }
        
        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event: string, newSession: Session | null) => {
            setUser(newSession?.user || null);
            setSession(newSession);
            
            // Handle token refresh events
            if (event === 'TOKEN_REFRESHED') {
              console.log('Token was refreshed');
            } else if (event === 'SIGNED_OUT') {
              console.log('User signed out');
            }
          }
        );
        
        return () => {
          subscription.unsubscribe();
        };
      } catch (err) {
        console.error('Error initializing auth:', err);
        setUser(null);
        setSession(null);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    };

    initializeAuth();
  }, []);
  
  // Helper function to check if session is close to expiry
  const isSessionNearExpiry = (session: Session) => {
    if (!session.expires_at) return false;
    
    // Check if token expires in less than 5 minutes
    const expiresAt = new Date(session.expires_at * 1000);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    return expiresAt.getTime() - now.getTime() < fiveMinutes;
  };

  const signIn = async (email: string, password: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  };

  const signOut = async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error signing out:', error);
        throw error;
      }
      // Clear any local state if needed
      // User will be set to null by the auth state change listener
    } catch (error) {
      console.error('Unexpected error during sign out:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      initialized,
      signIn, 
      signUp, 
      signOut,
      refreshSession 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
