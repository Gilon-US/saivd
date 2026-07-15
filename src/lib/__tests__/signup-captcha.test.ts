/** @jest-environment node */

import {
  isSignupCaptchaClientEnabled,
  isSignupCaptchaServerEnabled,
  verifyTurnstileToken,
} from "../signup-captcha";

describe("signup-captcha", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = {...env};
    delete process.env.SIGNUP_CAPTCHA_ENABLED;
    delete process.env.NEXT_PUBLIC_SIGNUP_CAPTCHA_ENABLED;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  afterAll(() => {
    process.env = env;
  });

  it("is disabled by default on client and server", () => {
    expect(isSignupCaptchaClientEnabled()).toBe(false);
    expect(isSignupCaptchaServerEnabled()).toBe(false);
  });

  it("enables server check only when flag and keys are set", () => {
    process.env.SIGNUP_CAPTCHA_ENABLED = "true";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    process.env.TURNSTILE_SECRET_KEY = "secret-key";
    expect(isSignupCaptchaServerEnabled()).toBe(true);
  });

  it("verifyTurnstileToken returns false without secret", async () => {
    await expect(verifyTurnstileToken("token")).resolves.toBe(false);
  });
});
