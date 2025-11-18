"use client";

import {createContext, useContext, useState, useEffect, useCallback, ReactNode} from "react";
import {useAuth} from "@/contexts/AuthContext";
import {useToast} from "@/hooks/useToast";

// Define the profile type
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  photo: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

// Define the context type
interface ProfileContextType {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  updateProfile: (data: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

// Create the context
const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

// Provider component
export function ProfileProvider({children}: {children: ReactNode}) {
  const {user} = useAuth();
  const {toast} = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<boolean>(false);

  // Function to refresh profile data
  const refreshProfile = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/profile");
      const result = await response.json();

      if (result.success) {
        setProfile(result.data);
      } else {
        setError(result.error);
        toast({
          title: "Error loading profile",
          description: result.error,
          variant: "error",
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load profile";
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "error",
      });
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [user, toast]);

  // Function to update profile
  const updateProfile = useCallback(
    async (data: Partial<Profile>) => {
      if (!user) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (result.success) {
          setProfile(result.data);
          toast({
            title: "Profile updated",
            description: "Your profile has been updated successfully.",
            variant: "success",
          });
        } else {
          setError(result.error);
          toast({
            title: "Update failed",
            description: result.error,
            variant: "error",
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update profile";
        setError(errorMessage);
        toast({
          title: "Error",
          description: errorMessage,
          variant: "error",
        });
      } finally {
        setLoading(false);
      }
    },
    [user, toast]
  );

  // Fetch profile when user changes
  useEffect(() => {
    if (user) {
      refreshProfile();
    } else {
      setProfile(null);
      setInitialized(true);
    }
  }, [user, refreshProfile]);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        error,
        initialized,
        updateProfile,
        refreshProfile,
      }}>
      {children}
    </ProfileContext.Provider>
  );
}

// Custom hook to use the profile context
export function useProfile() {
  const context = useContext(ProfileContext);

  if (context === undefined) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }

  return context;
}
