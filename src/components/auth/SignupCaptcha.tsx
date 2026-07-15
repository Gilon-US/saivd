"use client";

import {useCallback, useEffect, useRef} from "react";
import {getTurnstileSiteKey, isSignupCaptchaClientEnabled} from "@/lib/signup-captcha";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type SignupCaptchaProps = {
  onToken: (token: string | null) => void;
};

/** Renders nothing unless NEXT_PUBLIC_SIGNUP_CAPTCHA_ENABLED=true and site key is set. */
export function SignupCaptcha({onToken}: SignupCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const enabled = isSignupCaptchaClientEnabled();
  const siteKey = getTurnstileSiteKey();

  const clearToken = useCallback(() => {
    onToken(null);
  }, [onToken]);

  useEffect(() => {
    if (!enabled || !siteKey || !containerRef.current) return;

    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onToken(token),
        "expired-callback": clearToken,
        "error-callback": clearToken,
      });
    };

    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) renderWidget();
      else existing.addEventListener("load", renderWidget);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", renderWidget);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = renderWidget;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [enabled, siteKey, onToken, clearToken]);

  if (!enabled || !siteKey) return null;

  return <div ref={containerRef} className="flex justify-center" data-testid="signup-captcha" />;
}
