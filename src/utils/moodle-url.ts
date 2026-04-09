const ASSIGNMENT_VIEW_PATH = "/mod/assign/view.php";

/** Check if HTML response is a Moodle login page (session expired). */
export const isLoginHtml = (html: string): boolean => {
  const normalized = html.replace(/\s+/g, " ");
  return (
    normalized.includes('name="logintoken"') ||
    normalized.includes('id="login"') ||
    normalized.includes("/login/index.php")
  );
};

export const getQueryParamValue = (url: string, key: string): string | null => {
  if (!url) return null;

  let search = "";
  try {
    search = new URL(url).search;
  } catch {
    const queryStart = url.indexOf("?");
    if (queryStart >= 0) {
      search = url.slice(queryStart);
    }
  }

  const params = new URLSearchParams(search);
  return params.get(key);
};

export const parseAssignmentIdFromMoodleUrl = (
  url: string,
): string | null => {
  if (!url || !url.includes(ASSIGNMENT_VIEW_PATH)) return null;
  return getQueryParamValue(url, "id");
};
