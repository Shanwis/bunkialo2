import type { BunkxAttendancePayload } from "@/types";

const BUNKX_BASE_URL = "https://bunkx-iiitk.vercel.app";
const SESSION_CREATE_ENDPOINT = `${BUNKX_BASE_URL}/api/bunkx/session`;

interface SessionCreateResponse {
  sid: string;
  expiresAt?: string;
}

const parseSessionCreateResponse = (value: unknown): SessionCreateResponse => {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid Bunkx session response");
  }

  const sidValue = (value as { sid?: unknown }).sid;
  const expiresAtValue = (value as { expiresAt?: unknown }).expiresAt;

  if (!sidValue || typeof sidValue !== "string") {
    throw new Error("Missing session id in Bunkx response");
  }

  return {
    sid: sidValue,
    expiresAt: typeof expiresAtValue === "string" ? expiresAtValue : undefined,
  };
};

export const createBunkxSession = async (
  payload: BunkxAttendancePayload,
): Promise<string> => {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, 15000);

  try {
    const response = await fetch(SESSION_CREATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Session creation failed (${response.status})`);
    }

    const parsed = parseSessionCreateResponse(
      (await response.json()) as unknown,
    );

    return `${BUNKX_BASE_URL}/bunkialo?sid=${encodeURIComponent(parsed.sid)}`;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Session request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
