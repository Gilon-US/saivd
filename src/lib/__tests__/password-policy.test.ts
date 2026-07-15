import {getPasswordPolicyError, isPasswordPolicyValid, PASSWORD_RULES} from "../password-policy";

describe("password-policy", () => {
  it("rejects weak passwords", () => {
    expect(isPasswordPolicyValid("short")).toBe(false);
    expect(isPasswordPolicyValid("alllowercase1!")).toBe(false);
    expect(isPasswordPolicyValid("ALLUPPER1!")).toBe(false);
    expect(isPasswordPolicyValid("NoDigits!!")).toBe(false);
    expect(isPasswordPolicyValid("NoSpecial1")).toBe(false);
  });

  it("accepts valid passwords", () => {
    expect(isPasswordPolicyValid("Secure1!pass")).toBe(true);
  });

  it("reports policy error for invalid password", () => {
    expect(getPasswordPolicyError("")).toMatch(/required/i);
    expect(getPasswordPolicyError("weak")).toMatch(/requirements/i);
    expect(getPasswordPolicyError("Secure1!pass")).toBeNull();
  });

  it("defines five rules", () => {
    expect(PASSWORD_RULES).toHaveLength(5);
  });
});
