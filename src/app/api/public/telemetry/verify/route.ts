import {NextRequest, NextResponse} from "next/server";

/**
 * QA-only verify failure beacon (console log). Removable after iOS QA.
 * Lives under /api/public so middleware auth exclusion is unchanged.
 *
 * Disable with VERIFY_TELEMETRY=0.
 */
export async function POST(request: NextRequest) {
  if (process.env.VERIFY_TELEMETRY === "0") {
    return NextResponse.json({success: true, ignored: true}, {status: 204});
  }

  try {
    const body = await request.json().catch(() => null);
    console.info("[telemetry/verify]", {
      reason: body?.reason,
      detail: body?.detail,
      endpoint: body?.endpoint,
      path: body?.path,
      ua: typeof body?.ua === "string" ? body.ua.slice(0, 240) : undefined,
      appVersion: body?.appVersion,
      ts: body?.ts,
    });
  } catch (err) {
    console.warn("[telemetry/verify] parse failed", err);
  }

  return NextResponse.json({success: true}, {status: 204});
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
