"use client";

import {useEffect, useState} from "react";
import {createClient} from "@/utils/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const supabase = createClient();
        const {
          data: {session},
        } = await supabase.auth.getSession();

        // If there is no session, user likely hit this page without a valid recovery link
        if (!session) {
          setError("This password reset link is invalid or has expired.");
        }
      } catch {
        setError("Unable to verify reset link.");
      } finally {
        setInitialized(true);
      }
    };

    void init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const {error: updateError} = await supabase.auth.updateUser({password});

      if (updateError) {
        setError(updateError.message);
        toast.error("Unable to reset password", {description: updateError.message});
        return;
      }

      toast.success("Password reset successfully");
      window.location.href = "/login";
    } catch {
      setError("An unexpected error occurred");
      toast.error("Unable to reset password", {description: "An unexpected error occurred"});
    } finally {
      setIsLoading(false);
    }
  };

  if (!initialized) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Reset your password</h1>
          <p className="text-gray-500 dark:text-gray-400">Choose a new password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 text-sm text-white bg-red-500 rounded">{error}</div>}

          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Updating password..." : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
