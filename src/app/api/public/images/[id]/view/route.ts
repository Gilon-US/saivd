import {NextRequest, NextResponse} from "next/server";
import {getPublicImageViewData} from "@/lib/image-view-url";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, {status: 204, headers: {...CORS_HEADERS}});
}

/** GET /api/public/images/[id]/view — public presigned URL for viewer /i and /embed/i pages. */
export async function GET(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  const {id: imageId} = await context.params;
  const result = await getPublicImageViewData(imageId);

  if (!result.ok) {
    return NextResponse.json(
      {success: false, error: {code: result.code, message: result.message}},
      {status: result.status, headers: {...CORS_HEADERS}},
    );
  }

  return NextResponse.json(
    {success: true, data: {viewUrl: result.viewUrl}},
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
