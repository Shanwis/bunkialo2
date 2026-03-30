import { parseBunkxAttendancePayload } from "@/lib/bunkx-payload";
import { createSession } from "@/lib/bunkx-session-store";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const payload = parseBunkxAttendancePayload(
      (await request.json()) as unknown,
    );
    const session = createSession(payload);

    return NextResponse.json(session, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid request payload";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
