'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  
  // Get redirectTo from URL query parameters
  const getRedirectPath = () => {
    // Get the redirectTo parameter from the URL if it exists
    const params = new URLSearchParams(window.location.search);
    const redirectTo = params.get('redirectTo');
    return redirectTo || '/dashboard/videos';
  };

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    let isValid = true;

    if (!email) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
      isValid = false;
    }

    if (!password) {
      newErrors.password = 'Password is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      // Create a Supabase client for this request
      const supabase = createClient();
      
      // Use Supabase for authentication with cookie-based session
      const { error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (error) {
        if (error.message.includes('credentials')) {
          setErrors({ general: 'Invalid email or password' });
        } else {
          setErrors({ general: error.message });
        }
        toast.error('Login failed', {
          description: error.message
        });
      } else {
        toast.success('Login successful');
        
        // Get the redirect path
        const redirectPath = getRedirectPath();
        
        // Log for debugging
        console.log('Authentication successful, redirecting to:', redirectPath);
        
        // Force a full page reload to ensure the session is properly recognized
        // This is critical for Next.js App Router with Supabase authentication
        window.location.href = redirectPath;
      }
    } catch {
      setErrors({ general: 'An unexpected error occurred' });
      toast.error('Login failed', {
        description: 'An unexpected error occurred'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Login</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Enter your credentials to access your account
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.general && (
          <div className="p-3 text-sm text-white bg-red-500 rounded">
            {errors.general}
          </div>
        )}
        
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
          />
          {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <a href="#" className="text-sm text-blue-500 hover:underline">
              Forgot password?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />
          {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
        </div>
        
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
      
      <div className="text-center text-sm">
        Don&apos;t have an account?{' '}
        <a href="/register" className="text-blue-500 hover:underline">
          Sign up
        </a>
      </div>
    </div>
  );
}
