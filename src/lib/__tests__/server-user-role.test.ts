import {BOOTSTRAP_SUPERUSER_EMAIL} from "@/lib/bootstrap-superuser";
import {getSetUserRoleBlocker} from "@/lib/server-user-role";

const actorId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const targetId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("getSetUserRoleBlocker", () => {
  it("allows superuser to promote when under cap", () => {
    expect(
      getSetUserRoleBlocker({
        actorRole: "superuser",
        actorEmail: "su@example.com",
        actorUserId: actorId,
        targetId,
        targetRole: "user",
        newRole: "admin",
        adminCount: 0,
      })
    ).toBeNull();
  });

  it("allows bootstrap email as actor even when role is user", () => {
    expect(
      getSetUserRoleBlocker({
        actorRole: "user",
        actorEmail: BOOTSTRAP_SUPERUSER_EMAIL,
        actorUserId: actorId,
        targetId,
        targetRole: "user",
        newRole: "admin",
        adminCount: 1,
      })
    ).toBeNull();
  });

  it("rejects non-privileged actor", () => {
    expect(
      getSetUserRoleBlocker({
        actorRole: "user",
        actorEmail: "other@example.com",
        actorUserId: actorId,
        targetId,
        targetRole: "user",
        newRole: "admin",
        adminCount: 0,
      })
    ).toBe("only superuser can change roles");
  });

  it("enforces admin cap", () => {
    expect(
      getSetUserRoleBlocker({
        actorRole: "superuser",
        actorEmail: "su@example.com",
        actorUserId: actorId,
        targetId,
        targetRole: "user",
        newRole: "admin",
        adminCount: 3,
      })
    ).toBe("admin cap reached (3)");
  });

  it("does not count cap when target is already admin", () => {
    expect(
      getSetUserRoleBlocker({
        actorRole: "superuser",
        actorEmail: "su@example.com",
        actorUserId: actorId,
        targetId,
        targetRole: "admin",
        newRole: "admin",
        adminCount: 3,
      })
    ).toBeNull();
  });

  it("blocks self demotion / self role change except to superuser", () => {
    expect(
      getSetUserRoleBlocker({
        actorRole: "superuser",
        actorEmail: "su@example.com",
        actorUserId: actorId,
        targetId: actorId,
        targetRole: "superuser",
        newRole: "admin",
        adminCount: 0,
      })
    ).toBe("superuser cannot demote themselves");
  });

  it("blocks promoting another user to superuser", () => {
    expect(
      getSetUserRoleBlocker({
        actorRole: "superuser",
        actorEmail: "su@example.com",
        actorUserId: actorId,
        targetId,
        targetRole: "user",
        newRole: "superuser",
        adminCount: 0,
      })
    ).toBe("cannot create a second superuser");
  });
});
