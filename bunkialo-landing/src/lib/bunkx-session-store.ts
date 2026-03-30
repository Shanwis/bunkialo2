import type { BunkxAttendancePayload } from "@/lib/bunkx-payload";

interface SessionRecord {
  payload: BunkxAttendancePayload;
  expiresAtMs: number;
}

interface CreatedSession {
  sid: string;
  expiresAt: string;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const sessionStore = new Map<string, SessionRecord>();

const cleanupExpiredSessions = (): void => {
  const now = Date.now();
  for (const [sid, record] of sessionStore.entries()) {
    if (record.expiresAtMs <= now) {
      sessionStore.delete(sid);
    }
  }
};

const generateSessionId = (): string => {
  return crypto.randomUUID();
};

const generateUniqueSessionId = (): string => {
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const sid = generateSessionId();
    if (!sessionStore.has(sid)) {
      return sid;
    }
  }

  throw new Error("Could not generate unique session id");
};

export const createSession = (
  payload: BunkxAttendancePayload,
  ttlMs: number = DEFAULT_TTL_MS,
): CreatedSession => {
  cleanupExpiredSessions();

  const now = Date.now();
  const expiresAtMs = now + Math.max(60_000, ttlMs);
  const sid = generateUniqueSessionId();

  sessionStore.set(sid, {
    payload,
    expiresAtMs,
  });

  return {
    sid,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
};

export const consumeSession = (sid: string): BunkxAttendancePayload | null => {
  cleanupExpiredSessions();

  const existing = sessionStore.get(sid);
  if (!existing) {
    return null;
  }

  sessionStore.delete(sid);
  return existing.payload;
};
