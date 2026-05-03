import {BOOTSTRAP_SUPERUSER_EMAIL} from "@/lib/bootstrap-superuser";
import {effectiveProfileRole, isStaffProfile, isStaffRole, isSuperuserProfile} from "@/lib/app-role";

describe("isStaffRole", () => {
  it("returns true for admin and superuser", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("superuser")).toBe(true);
  });

  it("returns false for user and unknown", () => {
    expect(isStaffRole("user")).toBe(false);
    expect(isStaffRole("")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });
});

describe("bootstrap superuser profile helpers", () => {
  it("treats bootstrap email as staff and superuser regardless of stored role", () => {
    const p = {email: BOOTSTRAP_SUPERUSER_EMAIL, role: "user"};
    expect(isStaffProfile(p)).toBe(true);
    expect(isSuperuserProfile(p)).toBe(true);
    expect(effectiveProfileRole(p)).toBe("superuser");
  });

  it("does not treat other emails as bootstrap", () => {
    const p = {email: "other@example.com", role: "user"};
    expect(isStaffProfile(p)).toBe(false);
    expect(isSuperuserProfile(p)).toBe(false);
    expect(effectiveProfileRole(p)).toBe("user");
  });

  it("grants staff via authEmail even when profile is null", () => {
    expect(isStaffProfile(null, BOOTSTRAP_SUPERUSER_EMAIL)).toBe(true);
    expect(isSuperuserProfile(null, BOOTSTRAP_SUPERUSER_EMAIL)).toBe(true);
    expect(effectiveProfileRole(null, BOOTSTRAP_SUPERUSER_EMAIL)).toBe("superuser");
  });

  it("does not grant staff via non-bootstrap authEmail", () => {
    expect(isStaffProfile(null, "other@example.com")).toBe(false);
    expect(isSuperuserProfile(null, "other@example.com")).toBe(false);
    expect(effectiveProfileRole(null, "other@example.com")).toBe("user");
  });
});
