"use client";

import {useCallback, useState} from "react";
import Link from "next/link";
import {createClient} from "@/utils/supabase/client";
import {SignupCaptcha} from "@/components/auth/SignupCaptcha";
import {isSignupCaptchaClientEnabled} from "@/lib/signup-captcha";
import {getPasswordPolicyError, PASSWORD_RULES} from "@/lib/password-policy";
import {validatePhoneNumber} from "@/lib/phone-validation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {cn} from "@/lib/utils";
import {toast} from "sonner";

type FieldErrors = {
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  acceptedTerms?: string;
  captcha?: string;
  general?: string;
};

type TouchedFields = {
  email: boolean;
  phone: boolean;
  password: boolean;
  confirmPassword: boolean;
  acceptedTerms: boolean;
};

const INITIAL_TOUCHED: TouchedFields = {
  email: false,
  phone: false,
  password: false,
  confirmPassword: false,
  acceptedTerms: false,
};

function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Email is required";
  if (!/\S+@\S+\.\S+/.test(value)) return "Email is invalid";
  return undefined;
}

function validatePhone(value: string): string | undefined {
  const result = validatePhoneNumber(value);
  return result.ok ? undefined : result.message;
}

function validateConfirmPassword(password: string, confirm: string): string | undefined {
  if (!confirm) return "Please confirm your password";
  if (password !== confirm) return "Passwords do not match";
  return undefined;
}

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<TouchedFields>(INITIAL_TOUCHED);

  const captchaRequired = isSignupCaptchaClientEnabled();

  const setFieldError = useCallback((field: keyof FieldErrors, message?: string) => {
    setErrors((prev) => ({...prev, [field]: message}));
  }, []);

  const markTouched = useCallback((field: keyof TouchedFields) => {
    setTouched((prev) => ({...prev, [field]: true}));
  }, []);

  const handleCaptchaToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
    if (token) setFieldError("captcha", undefined);
  }, [setFieldError]);

  const runEmailValidation = useCallback(
    (value: string, show: boolean) => {
      if (!show) return;
      setFieldError("email", validateEmail(value));
    },
    [setFieldError],
  );

  const runPhoneValidation = useCallback(
    (value: string, show: boolean) => {
      if (!show) return;
      setFieldError("phone", validatePhone(value));
    },
    [setFieldError],
  );

  const runPasswordValidation = useCallback(
    (value: string, show: boolean) => {
      if (!show) return;
      setFieldError("password", getPasswordPolicyError(value) ?? undefined);
    },
    [setFieldError],
  );

  const runConfirmValidation = useCallback(
    (pwd: string, confirm: string, show: boolean) => {
      if (!show && !confirm) return;
      setFieldError("confirmPassword", validateConfirmPassword(pwd, confirm));
    },
    [setFieldError],
  );

  const validateForm = () => {
    const nextErrors: FieldErrors = {
      email: validateEmail(email),
      phone: validatePhone(phone),
      password: getPasswordPolicyError(password) ?? undefined,
      confirmPassword: validateConfirmPassword(password, confirmPassword),
      acceptedTerms: acceptedTerms
        ? undefined
        : "You must read and accept the Terms and Conditions",
      captcha:
        captchaRequired && !captchaToken ? "Please complete the security check" : undefined,
    };

    setErrors(nextErrors);
    setTouched({
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
      acceptedTerms: true,
    });

    return !Object.values(nextErrors).some(Boolean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const phoneResult = validatePhoneNumber(phone);
    if (!phoneResult.ok) {
      setFieldError("phone", phoneResult.message);
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          email: email.trim(),
          phone: phoneResult.e164,
          password,
          acceptedTerms: true,
          ...(captchaToken ? {captchaToken} : {}),
        }),
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
          setFieldError("email", "This email is already registered");
        } else if (code === "validation_error") {
          const lower = message.toLowerCase();
          if (lower.includes("email")) setFieldError("email", message);
          else if (lower.includes("phone")) setFieldError("phone", message);
          else if (lower.includes("password")) setFieldError("password", message);
          else if (lower.includes("terms")) setFieldError("acceptedTerms", message);
          else if (lower.includes("security") || lower.includes("captcha"))
            setFieldError("captcha", message);
          else setFieldError("general", message);
        } else {
          setFieldError("general", message);
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
        setFieldError("general", signInError.message);
        toast.error("Account created but sign-in failed", {description: signInError.message});
        return;
      }

      toast.success("Account created", {description: "Welcome to SAIVD"});
      window.location.href = "/dashboard/videos";
    } catch {
      setFieldError("general", "An unexpected error occurred");
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

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errors.general && (
          <div className="p-3 text-sm text-white bg-red-500 rounded">{errors.general}</div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              const value = e.target.value;
              setEmail(value);
              runEmailValidation(value, touched.email);
            }}
            onBlur={() => {
              markTouched("email");
              runEmailValidation(email, true);
            }}
            disabled={isLoading}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+1 415 555 2671 or 415 555 2671"
            value={phone}
            onChange={(e) => {
              const value = e.target.value;
              setPhone(value);
              runPhoneValidation(value, touched.phone);
            }}
            onBlur={() => {
              markTouched("phone");
              runPhoneValidation(phone, true);
            }}
            disabled={isLoading}
            aria-invalid={Boolean(errors.phone)}
          />
          <p className="text-xs text-muted-foreground">
            US 10-digit or international with country code (e.g. +44…). SMS verification is not
            required yet.
          </p>
          {errors.phone && <p className="text-sm text-red-500">{errors.phone}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              const value = e.target.value;
              setPassword(value);
              runPasswordValidation(value, touched.password);
              runConfirmValidation(value, confirmPassword, touched.confirmPassword || Boolean(confirmPassword));
            }}
            onBlur={() => {
              markTouched("password");
              runPasswordValidation(password, true);
            }}
            disabled={isLoading}
            aria-invalid={Boolean(errors.password)}
          />
          <ul className="space-y-1 text-xs" aria-live="polite">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(password);
              return (
                <li
                  key={rule.id}
                  className={cn(
                    "flex items-center gap-2",
                    met ? "text-green-600 dark:text-green-500" : "text-muted-foreground",
                  )}>
                  <span aria-hidden="true">{met ? "✓" : "○"}</span>
                  {rule.label}
                </li>
              );
            })}
          </ul>
          {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => {
              const value = e.target.value;
              setConfirmPassword(value);
              runConfirmValidation(password, value, touched.confirmPassword || Boolean(value));
            }}
            onBlur={() => {
              markTouched("confirmPassword");
              runConfirmValidation(password, confirmPassword, true);
            }}
            disabled={isLoading}
            aria-invalid={Boolean(errors.confirmPassword)}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-red-500">{errors.confirmPassword}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <input
              id="acceptedTerms"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => {
                const checked = e.target.checked;
                setAcceptedTerms(checked);
                markTouched("acceptedTerms");
                setFieldError(
                  "acceptedTerms",
                  checked ? undefined : "You must read and accept the Terms and Conditions",
                );
              }}
              disabled={isLoading}
              className="mt-1 h-4 w-4 shrink-0 rounded border-input"
            />
            <Label htmlFor="acceptedTerms" className="text-sm font-normal leading-snug">
              I have read and agree to the{" "}
              <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                Terms and Conditions
              </Link>
            </Label>
          </div>
          {errors.acceptedTerms && <p className="text-sm text-red-500">{errors.acceptedTerms}</p>}
        </div>

        <SignupCaptcha onToken={handleCaptchaToken} />
        {errors.captcha && <p className="text-sm text-red-500">{errors.captcha}</p>}

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
