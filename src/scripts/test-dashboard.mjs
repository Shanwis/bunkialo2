/**
 * Test script - Dashboard Timeline API exploration
 * Run with: node src/scripts/test-dashboard.mjs
 * Required env: LMS_TEST_USERNAME, LMS_TEST_PASSWORD
 */

import { writeFileSync } from "fs";
import { createLmsSession, loadEnvFromRoot } from "./utils/lms-session.mjs";

loadEnvFromRoot();
const session = createLmsSession();
const BASE_URL = session.baseUrl;

async function testTimelineApi(sesskey) {
  console.log("\n[2] TESTING core_calendar_get_action_events_by_timesort");
  const sessionReady = await session.ensureSession();
  if (!sessionReady) {
    console.log("  ERROR: Could not establish LMS session");
    return null;
  }

  const payload = [
    {
      index: 0,
      methodname: "core_calendar_get_action_events_by_timesort",
      args: {
        limitnum: 10,
        timesortfrom: Math.floor(Date.now() / 1000),
        limittononsuspendedevents: true,
      },
    },
  ];

  const res = await session.fetchWithSession(
    `${BASE_URL}/lib/ajax/service.php?sesskey=${sesskey}&info=core_calendar_get_action_events_by_timesort`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const data = await res.json();
  writeFileSync("src/scripts/timeline-response.json", JSON.stringify(data, null, 2));
  console.log("  Saved response to src/scripts/timeline-response.json");

  if (data[0]?.error) {
    console.log("  Error:", data[0].exception?.message);
    return null;
  }

  const events = data[0]?.data?.events || [];
  console.log(`  Found ${events.length} upcoming events`);

  events.forEach((e, i) => {
    const dueDate = new Date(e.timesort * 1000);
    console.log(`  ${i + 1}. ${e.name}`);
    console.log(`     Course: ${e.course?.fullname || "N/A"}`);
    console.log(`     Due: ${dueDate.toLocaleString()}`);
    console.log(`     URL: ${e.url}`);
  });

  return data;
}

async function main() {
  console.log("======================================");
  console.log("  LMS DASHBOARD TIMELINE API TEST");
  console.log("======================================");

  try {
    console.log("\n[1] LOGIN");
    const loginOk = await session.login();
    const cookieCount = await session.getCookieCount();
    console.log(`  Result: ${loginOk ? "SUCCESS" : "FAILED"} (cookies=${cookieCount})`);
    if (!loginOk) {
      process.exit(1);
    }

    const sesskey = await session.getSesskey();
    if (!sesskey) {
      console.log("ERROR: No sesskey");
      process.exit(1);
    }

    console.log(`  Sesskey: ${sesskey}`);
    await testTimelineApi(sesskey);

    console.log("\n======================================");
    console.log("  DONE");
    console.log("======================================");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("\n[ERROR]", message);
    process.exit(1);
  }
}

main();
