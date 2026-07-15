/** @jest-environment node */

import {POST} from "../route";
import {NextRequest} from "next/server";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {isSignupCaptchaServerEnabled, verifyTurnstileToken} from "@/lib/signup-captcha";

jest.mock("@/utils/supabase/service", () => ({
  createServiceRoleClient: jest.fn(),
}));

jest.mock("@/lib/signup-captcha", () => ({
  isSignupCaptchaServerEnabled: jest.fn(),
  verifyTurnstileToken: jest.fn(),
}));

describe("POST /api/auth/register", () => {
  const mockCreateUser = jest.fn();
  const mockListUsers = jest.fn();
  const mockUpdateUserById = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (isSignupCaptchaServerEnabled as jest.Mock).mockReturnValue(false);
    (verifyTurnstileToken as jest.Mock).mockResolvedValue(true);
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

  const validBody = {
    email: "user@example.com",
    phone: "+14155552671",
    password: "Secure1!pass",
    acceptedTerms: true,
  };

  it("returns 400 when terms are not accepted", async () => {
    const res = await POST(
      makeRequest({email: "user@example.com", phone: "+14155552671", password: "Secure1!pass"}),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/terms/i);
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest({...validBody, email: "bad"}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for weak password", async () => {
    const res = await POST(makeRequest({...validBody, password: "123"}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid phone", async () => {
    const res = await POST(makeRequest({...validBody, phone: "123"}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/phone|number/i);
  });

  it("creates a confirmed user", async () => {
    mockCreateUser.mockResolvedValue({
      data: {user: {id: "user-1"}},
      error: null,
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe("user-1");
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Secure1!pass",
      phone: "+14155552671",
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

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.existing).toBe(true);
    expect(mockUpdateUserById).toHaveBeenCalledWith("user-2", {
      email_confirm: true,
      password: "Secure1!pass",
      phone: "+14155552671",
    });
  });

  it("returns 400 when Supabase rejects email format", async () => {
    mockCreateUser.mockResolvedValue({
      data: {user: null},
      error: {message: "Unable to validate email address: invalid format"},
    });

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("requires captcha when server captcha is enabled", async () => {
    (isSignupCaptchaServerEnabled as jest.Mock).mockReturnValue(true);
    (verifyTurnstileToken as jest.Mock).mockResolvedValue(false);

    const res = await POST(makeRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.message).toMatch(/security verification/i);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("accepts valid captcha when server captcha is enabled", async () => {
    (isSignupCaptchaServerEnabled as jest.Mock).mockReturnValue(true);
    (verifyTurnstileToken as jest.Mock).mockResolvedValue(true);
    mockCreateUser.mockResolvedValue({
      data: {user: {id: "user-1"}},
      error: null,
    });

    const res = await POST(
      makeRequest({...validBody, captchaToken: "test-token"}),
    );

    expect(res.status).toBe(200);
    expect(verifyTurnstileToken).toHaveBeenCalledWith("test-token", null);
  });
});
