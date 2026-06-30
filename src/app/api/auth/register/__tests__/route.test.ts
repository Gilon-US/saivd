/** @jest-environment node */

import {POST} from "../route";
import {NextRequest} from "next/server";
import {createServiceRoleClient} from "@/utils/supabase/service";

jest.mock("@/utils/supabase/service", () => ({
  createServiceRoleClient: jest.fn(),
}));

describe("POST /api/auth/register", () => {
  const mockCreateUser = jest.fn();
  const mockListUsers = jest.fn();
  const mockUpdateUserById = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createServiceRoleClient as jest.Mock).mockReturnValue({
      auth: {
        admin: {
          createUser: mockCreateUser,
          listUsers: mockListUsers,
          updateUserById: mockUpdateUserById,
        },
      },
    });
  });

  function makeRequest(body: unknown) {
    return new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {"Content-Type": "application/json"},
    });
  }

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest({email: "bad", password: "secret1"}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for short password", async () => {
    const res = await POST(makeRequest({email: "user@example.com", password: "123"}));
    expect(res.status).toBe(400);
  });

  it("creates a confirmed user", async () => {
    mockCreateUser.mockResolvedValue({
      data: {user: {id: "user-1"}},
      error: null,
    });

    const res = await POST(makeRequest({email: "user@example.com", password: "secret1"}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe("user-1");
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret1",
      email_confirm: true,
    });
  });

  it("confirms an existing duplicate user so they can sign in", async () => {
    mockCreateUser.mockResolvedValue({
      data: {user: null},
      error: {message: "User already registered"},
    });
    mockListUsers.mockResolvedValue({
      data: {users: [{id: "user-2", email: "user@example.com"}]},
      error: null,
    });
    mockUpdateUserById.mockResolvedValue({data: {user: {id: "user-2"}}, error: null});

    const res = await POST(makeRequest({email: "user@example.com", password: "secret1"}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.existing).toBe(true);
    expect(mockUpdateUserById).toHaveBeenCalledWith("user-2", {
      email_confirm: true,
      password: "secret1",
    });
  });

  it("returns 400 when Supabase rejects email format", async () => {
    mockCreateUser.mockResolvedValue({
      data: {user: null},
      error: {message: "Unable to validate email address: invalid format"},
    });

    const res = await POST(makeRequest({email: "user@example.com", password: "secret1"}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });
});
