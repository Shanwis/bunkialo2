import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CookieJar } from "tough-cookie";

const DEFAULT_BASE_URL = "https://lmsug24.iiitkottayam.ac.in";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAX_REDIRECTS = 10;

const getRepoRoot = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..", "..", "..");
};

export const loadEnvFromRoot = () => {
  const root = getRepoRoot();
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

export const isLoginHtml = (html) => {
  const condensed = String(html).replace(/\s+/g, " ");
  return (
    condensed.includes('name="logintoken"') ||
    condensed.includes('id="login"') ||
    condensed.includes("/login/index.php")
  );
};

const isLoginSuccessful = (html) => {
  const condensed = String(html).replace(/\s+/g, " ");
  const hasUserMenu =
    condensed.includes("usermenu") ||
    condensed.includes("userloggedinas") ||
    condensed.includes("loggedin-user");
  const hasLogoutLink = /href=["'][^"']*logout/i.test(condensed);
  const hasLoginForm =
    /<form[^>]*id=["']login["']/i.test(condensed) ||
    /name=["']logintoken["']/i.test(condensed);
  const hasSesskey = /"sesskey":"[^"]+"/i.test(condensed);
  const hasError = /loginerrors|alert-danger|loginerrormessage/i.test(condensed);

  return (
    (hasUserMenu || hasLogoutLink || (hasSesskey && !hasLoginForm)) && !hasError
  );
};

const extractLoginToken = (html) => {
  const tokenMatch =
    html.match(/name=["']logintoken["'][^>]*value=["']([^"']+)["']/i) ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']logintoken["']/i);
  return tokenMatch?.[1] ?? null;
};

const collectSetCookieHeaders = (response) => {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
};

export const createLmsSession = ({
  baseUrl = process.env.LMS_BASE_URL || DEFAULT_BASE_URL,
  username = process.env.LMS_TEST_USERNAME,
  password = process.env.LMS_TEST_PASSWORD,
  userAgent = DEFAULT_USER_AGENT,
} = {}) => {
  if (!username || !password) {
    throw new Error(
      "Missing LMS_TEST_USERNAME/LMS_TEST_PASSWORD. Set env vars or .env values.",
    );
  }

  const jar = new CookieJar();

  const toAbsoluteUrl = (href) => {
    if (!href) return null;
    if (href.startsWith("http://") || href.startsWith("https://")) return href;
    if (href.startsWith("//")) return `https:${href}`;
    if (href.startsWith("/")) return `${baseUrl}${href}`;
    return `${baseUrl}/${href.replace(/^\.?\//, "")}`;
  };

  const storeResponseCookies = async (response, url) => {
    const setCookieHeaders = collectSetCookieHeaders(response);
    for (const cookie of setCookieHeaders) {
      await jar.setCookie(cookie, url);
    }
  };

  const fetchWithCookies = async (url, options = {}, redirectCount = 0) => {
    const absoluteUrl = toAbsoluteUrl(url);
    if (!absoluteUrl) {
      throw new Error("Invalid URL");
    }

    const cookieHeader = await jar.getCookieString(absoluteUrl);
    const headers = {
      "User-Agent": userAgent,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...options.headers,
    };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await fetch(absoluteUrl, {
      ...options,
      headers,
      redirect: "manual",
    });

    await storeResponseCookies(response, absoluteUrl);

    if (
      response.status >= 300 &&
      response.status < 400 &&
      redirectCount < MAX_REDIRECTS
    ) {
      const location = response.headers.get("location");
      if (!location) {
        return response;
      }
      const redirectUrl = new URL(location, absoluteUrl).toString();
      return fetchWithCookies(
        redirectUrl,
        { method: "GET", headers: options.headers },
        redirectCount + 1,
      );
    }

    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error("Too many redirects while fetching LMS URL");
    }

    return response;
  };

  const responseLooksLikeLoginPage = async (response) => {
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      return false;
    }
    const html = await response.clone().text();
    return isLoginHtml(html);
  };

  const login = async () => {
    const loginPageRes = await fetchWithCookies("/login/index.php");
    const loginPageHtml = await loginPageRes.text();
    const loginToken = extractLoginToken(loginPageHtml);

    if (!loginToken) {
      return false;
    }

    const formData = new URLSearchParams({
      anchor: "",
      logintoken: String(loginToken),
      username,
      password,
    });

    const loginRes = await fetchWithCookies("/login/index.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const loginHtml = await loginRes.text();
    return isLoginSuccessful(loginHtml);
  };

  const fetchWithSession = async (url, options = {}) => {
    let response = await fetchWithCookies(url, options);
    const isLoginPage = await responseLooksLikeLoginPage(response);
    if (!isLoginPage) return response;

    const reloginOk = await login();
    if (!reloginOk) return response;

    response = await fetchWithCookies(url, options);
    return response;
  };

  const ensureSession = async () => {
    const hasSession = await checkSession();
    if (hasSession) return true;
    return login();
  };

  const checkSession = async () => {
    const response = await fetchWithCookies("/my/");
    const html = await response.text();
    return isLoginSuccessful(html);
  };

  const getSesskey = async () => {
    const sessionReady = await ensureSession();
    if (!sessionReady) return null;

    const response = await fetchWithSession("/my/");
    const html = await response.text();
    const match = html.match(/"sesskey":"([^"]+)"/);
    return match?.[1] ?? null;
  };

  const getCookieCount = async () => {
    const cookies = await jar.getCookies(baseUrl);
    return cookies.length;
  };

  return {
    baseUrl,
    username,
    fetchWithCookies,
    fetchWithSession,
    toAbsoluteUrl,
    login,
    ensureSession,
    checkSession,
    getSesskey,
    getCookieCount,
  };
};
