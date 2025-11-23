"use client";

import {useState} from "react";
import {createClient} from "@/utils/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setSuccessMessage(null);

    if (!email) {
      setError("Email is required");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      const redirectTo = `${window.location.origin}/reset-password`;

      const {error: resetError} = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (resetError) {
        setError(resetError.message);
        toast.error("Unable to send reset email", {description: resetError.message});
        return;
      }

      setSuccessMessage("If an account exists for that email, a password reset link has been sent.");
      toast.success("Password reset email sent");
    } catch {
      setError("An unexpected error occurred");
      toast.error("Unable to send reset email", {description: "An unexpected error occurred"});
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Forgot password</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 text-sm text-white bg-red-500 rounded">{error}</div>}
        {successMessage && <div className="p-3 text-sm text-white bg-green-500 rounded">{successMessage}</div>}

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
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Sending reset link..." : "Send reset link"}
        </Button>
      </form>
    </div>
  );
}
