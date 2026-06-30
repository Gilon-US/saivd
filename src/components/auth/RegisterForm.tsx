"use client";

import {useState} from "react";
import {createClient} from "@/utils/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {toast} from "sonner";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});

  const validateForm = () => {
    const newErrors: {
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};
    let isValid = true;

    if (!email) {
      newErrors.email = "Email is required";
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Email is invalid";
      isValid = false;
    }

    if (!password) {
      newErrors.password = "Password is required";
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
      isValid = false;
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
      isValid = false;
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
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
      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: email.trim(), password}),
      });
      const registerBody = await registerRes.json().catch(() => null);

      if (!registerRes.ok || !registerBody?.success) {
        const code = registerBody?.error?.code as string | undefined;
        const message =
          registerBody?.error?.message ??
          (registerRes.status === 404
            ? "Registration is not available on this server yet."
            : "Registration failed");

        if (code === "conflict" || registerRes.status === 409) {
          setErrors({email: "This email is already registered"});
        } else if (code === "validation_error") {
          if (message.toLowerCase().includes("email")) {
            setErrors({email: message});
          } else if (message.toLowerCase().includes("password")) {
            setErrors({password: message});
          } else {
            setErrors({general: message});
          }
        } else {
          setErrors({general: message});
        }

        toast.error("Registration failed", {description: message});
        return;
      }

      const supabase = createClient();
      const {error: signInError} = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setErrors({general: signInError.message});
        toast.error("Account created but sign-in failed", {description: signInError.message});
        return;
      }

      toast.success("Account created", {description: "Welcome to SAIVD"});
      window.location.href = "/dashboard/videos";
    } catch {
      setErrors({general: "An unexpected error occurred"});
      toast.error("Registration failed", {description: "An unexpected error occurred"});
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">Create an account</h1>
        <p className="text-gray-500 dark:text-gray-400">Enter your information to get started</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.general && (
          <div className="p-3 text-sm text-white bg-red-500 rounded">{errors.general}</div>
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
          <Label htmlFor="password">Password</Label>
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

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
          />
          {errors.confirmPassword && <p className="text-sm text-red-500">{errors.confirmPassword}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <div className="text-center text-sm">
        Already have an account?{" "}
        <a href="/login" className="text-blue-500 hover:underline">
          Sign in
        </a>
      </div>
    </div>
  );
}
