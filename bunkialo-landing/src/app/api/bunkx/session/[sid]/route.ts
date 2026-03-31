import { consumeSession } from "@/lib/bunkx-session-store";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sid: string }> },
) {
  const params = await context.params;
  const payload = consumeSession(params.sid);

  if (!payload) {
    return NextResponse.json(
      {
        error: "Session not found or expired",
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
