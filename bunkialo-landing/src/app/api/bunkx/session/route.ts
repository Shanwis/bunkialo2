import { parseBunkxAttendancePayload } from "@/lib/bunkx-payload";
import { createSession } from "@/lib/bunkx-session-store";
import { NextResponse } from "next/server";

const toSafeErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return "Invalid request payload";
  }

  const knownValidationMessages = new Set([
    "Payload must be an object",
    "attendance_rows must be an array",
    "Invalid attendance row",
    "Invalid period_date",
    "Invalid session_time",
    "Invalid course_code",
    "Invalid subject_name",
    "Invalid faculty",
    "Invalid faculty_email",
    "Invalid score",
  ]);

  if (knownValidationMessages.has(error.message)) {
    return error.message;
  }

  return "An unexpected error occurred";
};

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
    const message = toSafeErrorMessage(error);

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
