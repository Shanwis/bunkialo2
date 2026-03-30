import type { BunkxAttendancePayload } from "@/lib/bunkx-payload";
import { headers } from "next/headers";

interface BunkialoPageProps {
  searchParams: Promise<{ sid?: string }>;
}

export default async function BunkialoPage({
  searchParams,
}: BunkialoPageProps) {
  const params = await searchParams;
  const sid = params.sid?.trim();

  if (!sid) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Missing session id</h1>
        <p className="mt-3 text-sm text-zinc-600">
          Open this page from the app so attendance can be transferred securely.
        </p>
      </main>
    );
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const apiUrl = host
    ? `${proto}://${host}/api/bunkx/session/${encodeURIComponent(sid)}`
    : `/api/bunkx/session/${encodeURIComponent(sid)}`;

  const response = await fetch(apiUrl, {
    cache: "no-store",
  });

  let payload: BunkxAttendancePayload | null = null;
  if (response.ok) {
    payload = (await response.json()) as BunkxAttendancePayload;
  }

  if (!payload) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Session unavailable</h1>
        <p className="mt-3 text-sm text-zinc-600">
          This session has expired or was already used. Please launch Bunkx
          again from the app.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Bunkialo attendance handoff</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Received {payload.attendance_rows.length} records from the mobile app.
      </p>
      <pre className="mt-6 max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs leading-5 text-zinc-800">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </main>
  );
}
