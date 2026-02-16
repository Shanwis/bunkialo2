import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");

const DEFAULT_BASE_URL = "https://lmsug24.iiitkottayam.ac.in";
const COURSE_IDS = [119, 123];
const MAX_RESOURCE_TESTS_PER_COURSE = 6;
const MAX_FOLDER_FILE_TESTS_PER_COURSE = 6;

const readEnvFile = () => {
  if (!fs.existsSync(ENV_PATH)) return;
  const raw = fs.readFileSync(ENV_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

readEnvFile();

const BASE_URL = process.env.LMS_BASE_URL || DEFAULT_BASE_URL;
const USERNAME = process.env.LMS_TEST_USERNAME;
const PASSWORD = process.env.LMS_TEST_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error(
    "Missing LMS_TEST_USERNAME/LMS_TEST_PASSWORD. Set env vars or .env values.",
  );
  process.exit(1);
}

const cheerio = await import("cheerio");
const { CookieJar } = await import("tough-cookie");
const jar = new CookieJar();

const normalizeText = (value) => (value || "").replace(/\s+/g, " ").trim();

const toAbsoluteUrl = (href) => {
  if (!href) return null;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href.replace(/^\.?\//, "")}`;
};

const isLoginHtml = (html) => {
  const condensed = html.replace(/\s+/g, " ");
  return (
    condensed.includes('name="logintoken"') ||
    condensed.includes('id="login"') ||
    condensed.includes("/login/index.php")
  );
};

const getContentType = (headers) => {
  const value = headers.get("content-type") || headers.get("Content-Type") || "";
  return String(value).toLowerCase();
};

const getCookieCount = async () => {
  const cookies = await jar.getCookies(BASE_URL);
  return cookies.length;
};

async function fetchWithCookies(url, options = {}, redirectCount = 0) {
  const cookieHeader = await jar.getCookieString(url);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "*/*",
    ...(options.headers || {}),
  };
  if (cookieHeader) headers.Cookie = cookieHeader;

  const response = await fetch(url, {
    ...options,
    headers,
    redirect: "manual",
  });

  const setCookieHeaders = response.headers.getSetCookie?.() || [];
  for (const cookie of setCookieHeaders) {
    await jar.setCookie(cookie, url);
  }

  if (
    response.status >= 300 &&
    response.status < 400 &&
    redirectCount < 10
  ) {
    const location = response.headers.get("location");
    if (location) {
      const redirectUrl = location.startsWith("http")
        ? location
        : new URL(location, url).href;
      return fetchWithCookies(
        redirectUrl,
        {
          method: "GET",
          body: undefined,
        },
        redirectCount + 1,
      );
    }
  }

  return response;
}

async function login() {
  console.log("\n[1] Logging in...");
  const loginPageRes = await fetchWithCookies(`${BASE_URL}/login/index.php`);
  const loginPageHtml = await loginPageRes.text();
  const $ = cheerio.load(loginPageHtml);
  const loginToken = $('input[name="logintoken"]').val();

  if (!loginToken) {
    throw new Error("Could not find login token");
  }

  const formData = new URLSearchParams({
    anchor: "",
    logintoken: String(loginToken),
    username: USERNAME,
    password: PASSWORD,
  });

  const loginRes = await fetchWithCookies(`${BASE_URL}/login/index.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const loginHtml = await loginRes.text();
  const loggedIn =
    !isLoginHtml(loginHtml) &&
    (loginHtml.includes("logout") || loginHtml.includes('"sesskey":"'));

  const cookieCount = await getCookieCount();
  console.log(`  login: ${loggedIn ? "OK" : "FAILED"}, cookies=${cookieCount}`);
  if (!loggedIn) {
    throw new Error("Login failed");
  }
}

async function parseFolderFiles(folderUrl) {
  const response = await fetchWithCookies(folderUrl);
  const html = await response.text();
  const $ = cheerio.load(html);
  const files = [];
  const seen = new Set();

  $("main .foldertree a[href], .foldertree a[href]").each((_idx, link) => {
    const href = $(link).attr("href");
    const url = toAbsoluteUrl(href);
    if (!url || seen.has(url)) return;
    seen.add(url);
    files.push({
      name: normalizeText($(link).text()) || "file",
      url,
    });
  });

  return files;
}

async function discoverCourseDownloadTargets(courseId) {
  const response = await fetchWithCookies(`${BASE_URL}/course/view.php?id=${courseId}`);
  const html = await response.text();
  const $ = cheerio.load(html);

  const resourceLinks = [];
  const folderLinks = [];

  $("li.activity").each((_i, activity) => {
    const className = $(activity).attr("class") || "";
    const href =
      $(activity).find("a.aalink[href]").first().attr("href") ||
      $(activity).find("a[href*='/mod/'][href]").first().attr("href") ||
      "";

    const url = toAbsoluteUrl(href);
    if (!url) return;

    const title = normalizeText($(activity).find(".instancename").first().text());
    if (className.includes("modtype_resource")) {
      resourceLinks.push({ title: title || "resource", url });
    }
    if (className.includes("modtype_folder")) {
      folderLinks.push({ title: title || "folder", url });
    }
  });

  const folderFiles = [];
  for (const folder of folderLinks) {
    const files = await parseFolderFiles(folder.url);
    for (const file of files) {
      folderFiles.push({ title: file.name, url: file.url });
    }
  }

  return {
    resources: resourceLinks.slice(0, MAX_RESOURCE_TESTS_PER_COURSE),
    folderFiles: folderFiles.slice(0, MAX_FOLDER_FILE_TESTS_PER_COURSE),
  };
}

async function testDownloadTarget(kind, target) {
  const response = await fetchWithCookies(target.url);
  const status = response.status;
  const contentType = getContentType(response.headers);
  const bodyText =
    contentType.includes("text/html") || contentType.includes("application/xhtml")
      ? await response.text()
      : null;
  const loginPage = bodyText ? isLoginHtml(bodyText) : false;

  return {
    kind,
    title: target.title,
    url: target.url,
    status,
    contentType,
    loginPage,
    ok: status >= 200 && status < 300 && !loginPage,
  };
}

async function main() {
  console.log("======================================");
  console.log(" LMS AUTH DOWNLOAD TEST");
  console.log("======================================");
  console.log(`Base URL: ${BASE_URL}`);

  await login();

  const allResults = [];

  for (const courseId of COURSE_IDS) {
    console.log(`\n[2] Discovering targets in course ${courseId}...`);
    const targets = await discoverCourseDownloadTargets(courseId);
    console.log(
      `  resources=${targets.resources.length}, folderFiles=${targets.folderFiles.length}`,
    );

    for (const target of targets.resources) {
      const result = await testDownloadTarget("resource", target);
      allResults.push(result);
      console.log(
        `  [resource] ${result.ok ? "OK" : "FAIL"} status=${result.status} login=${result.loginPage} ${target.title}`,
      );
    }

    for (const target of targets.folderFiles) {
      const result = await testDownloadTarget("folder-file", target);
      allResults.push(result);
      console.log(
        `  [folder-file] ${result.ok ? "OK" : "FAIL"} status=${result.status} login=${result.loginPage} ${target.title}`,
      );
    }
  }

  const okCount = allResults.filter((item) => item.ok).length;
  const failCount = allResults.length - okCount;

  const reportPath = path.join(ROOT_DIR, "src", "scripts", "lms-download-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        testedAt: new Date().toISOString(),
        total: allResults.length,
        ok: okCount,
        failed: failCount,
        results: allResults,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("\n======================================");
  console.log(`Summary: total=${allResults.length}, ok=${okCount}, failed=${failCount}`);
  console.log(`Report: ${reportPath}`);
  console.log("======================================");

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
