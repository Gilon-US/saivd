/** @jest-environment node */

import {NextRequest} from "next/server";
import {GET} from "../route";
import {createClient} from "@/utils/supabase/server";
import {generatePresignedVideoUrl} from "@/lib/wasabi-urls";

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/wasabi-urls", () => ({
  generatePresignedVideoUrl: jest.fn(),
  extractKeyFromUrl: jest.fn((url: string) => {
    try {
      const u = new URL(url);
      return u.pathname.startsWith("/") ? u.pathname.slice(1) : u.pathname;
    } catch {
      return null;
    }
  }),
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockPresign = generatePresignedVideoUrl as jest.MockedFunction<typeof generatePresignedVideoUrl>;

function buildSupabaseMocks(videoRow: Record<string, unknown>, userId = "user-1") {
  const single = jest.fn().mockResolvedValue({data: videoRow, error: null});
  const eqUserId = jest.fn().mockReturnValue({single});
  const eqId = jest.fn().mockReturnValue({eq: eqUserId});
  const select = jest.fn().mockReturnValue({eq: eqId});
  const from = jest.fn().mockReturnValue({select});
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({data: {user: {id: userId}}}),
    },
    from,
    _single: single,
  };
}

describe("GET /api/videos/[id]/play", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPresign.mockResolvedValue("https://wasabi.example/presigned");
  });

  it("returns 401 when not authenticated", async () => {
    const supabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({data: {user: null}}),
      },
      from: jest.fn(),
    };
    mockCreateClient.mockResolvedValue(supabase as never);

    const req = new NextRequest("http://localhost/api/videos/v1/play?variant=upload");
    const res = await GET(req, {params: Promise.resolve({id: "v1"})});
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it("variant=upload presigns original_url even when normalized_url is set", async () => {
    const video = {
      id: "v1",
      user_id: "user-1",
      original_url: "uploads/abc/original.mov",
      normalized_url: "uploads/abc/normalized.mp4",
      processed_url: null,
    };
    mockCreateClient.mockResolvedValue(buildSupabaseMocks(video) as never);

    const req = new NextRequest("http://localhost/api/videos/v1/play?variant=upload");
    const res = await GET(req, {params: Promise.resolve({id: "v1"})});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.playbackUrl).toBe("https://wasabi.example/presigned");
    expect(mockPresign).toHaveBeenCalledWith("uploads/abc/original.mov");
  });

  it("default playback uses normalized_url when present", async () => {
    const video = {
      id: "v1",
      user_id: "user-1",
      original_url: "uploads/abc/original.mov",
      normalized_url: "uploads/abc/normalized.mp4",
      processed_url: null,
    };
    mockCreateClient.mockResolvedValue(buildSupabaseMocks(video) as never);

    const req = new NextRequest("http://localhost/api/videos/v1/play?variant=original");
    const res = await GET(req, {params: Promise.resolve({id: "v1"})});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPresign).toHaveBeenCalledWith("uploads/abc/normalized.mp4");
  });
});
