/**
 * Cloudflare Turnstile for signup — disabled unless SIGNUP_CAPTCHA_ENABLED=true
 * and both site + secret keys are configured. Do not enable in prod until ready.
 */

export function isSignupCaptchaClientEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_SIGNUP_CAPTCHA_ENABLED === "true" &&
    Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim())
  );
}

export function isSignupCaptchaServerEnabled(): boolean {
  return (
    process.env.SIGNUP_CAPTCHA_ENABLED === "true" &&
    Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) &&
    Boolean(process.env.TURNSTILE_SECRET_KEY?.trim())
  );
}

export function getTurnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key || null;
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !token) return false;

  const body = new URLSearchParams({secret, response: token});
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body,
    });
    const data = (await res.json()) as {success?: boolean};
    return Boolean(data?.success);
  } catch {
    return false;
  }
}
