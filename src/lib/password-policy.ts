export type PasswordRule = {
  id: string;
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "upper",
    label: "One uppercase letter",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lower",
    label: "One lowercase letter",
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: "digit",
    label: "One number",
    test: (p) => /\d/.test(p),
  },
  {
    id: "special",
    label: "One special character",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

const PASSWORD_POLICY_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function isPasswordPolicyValid(password: string): boolean {
  return PASSWORD_POLICY_RE.test(password);
}

export function getPasswordPolicyError(password: string): string | null {
  if (!password) return "Password is required";
  if (!isPasswordPolicyValid(password)) {
    return "Password must meet all requirements below";
  }
  return null;
}
