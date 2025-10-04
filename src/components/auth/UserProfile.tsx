'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export function UserProfile() {
  const { user } = useAuth();
  const { profile, loading, error, updateProfile } = useProfile();
  
  const [displayName, setDisplayName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Update local state when profile changes
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
    }
  }, [profile]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    // Validate input
    if (!displayName || displayName.trim().length < 2) {
      setFormError('Display name must be at least 2 characters');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await updateProfile({ display_name: displayName.trim() });
    } catch (err) {
      setFormError('Failed to update profile');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Your Profile</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={user?.email || ''}
            disabled
            aria-readonly="true"
          />
          <p className="text-xs text-gray-500">Email cannot be changed</p>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            required
            minLength={2}
            maxLength={50}
            disabled={isSubmitting}
            aria-invalid={formError ? 'true' : 'false'}
          />
          {formError && (
            <p className="text-sm text-red-500" role="alert">{formError}</p>
          )}
        </div>
        
        {error && !formError && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <Button type="submit" disabled={isSubmitting || loading}>
          {isSubmitting ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Saving...
            </>
          ) : 'Save Changes'}
        </Button>
      </form>
    </div>
  );
}
