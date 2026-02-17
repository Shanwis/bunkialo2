import {
  createLmsSession,
  loadEnvFromRoot,
} from "./utils/lms-session.mjs";

const DEFAULT_BASE_URL = "https://lmsug24.iiitkottayam.ac.in";
const ASSIGNMENT_IDS = [4155, 4250];

loadEnvFromRoot();

const cheerio = await import("cheerio");
const session = createLmsSession({
  baseUrl: process.env.LMS_BASE_URL || DEFAULT_BASE_URL,
});

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const extractJsonObjectAfterMarker = (input, marker) => {
  const markerIndex = input.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = input.indexOf("{", markerIndex + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, index + 1);
      }
    }
  }
  return null;
};

const parseAssignmentView = (html, assignmentId) => {
  const $ = cheerio.load(html);
  const title = normalizeText($("h1").first().text()) || `Assignment ${assignmentId}`;
  const breadcrumbItems = $("nav[aria-label='Navigation bar'] li")
    .map((_idx, el) => normalizeText($(el).text()))
    .get()
    .filter(Boolean);
  const courseName = breadcrumbItems[0] || "Course";

  const dates = {};
  $("[data-region='activity-dates'] div").each((_idx, el) => {
    const text = normalizeText($(el).text());
    const splitIndex = text.indexOf(":");
    if (splitIndex <= 0) return;
    const key = normalizeText(text.slice(0, splitIndex)).toLowerCase();
    const value = normalizeText(text.slice(splitIndex + 1));
    if (!value) return;

    if (key.startsWith("opened")) dates.opened = value;
    if (key.startsWith("due")) dates.due = value;
    if (key.startsWith("cut-off") || key.startsWith("cutoff")) dates.cutoff = value;
    if (key.startsWith("allow submissions from")) dates.allowFrom = value;
  });

  const statusRows = {};
  $(".submissionstatustable tr, table.generaltable tr").each((_idx, row) => {
    const key = normalizeText($(row).find("th").first().text()).toLowerCase();
    const value = normalizeText($(row).find("td").first().text());
    if (!key || !value) return;
    statusRows[key] = value;
  });

  const description = normalizeText(
    $(".activity-description #intro .no-overflow").first().text() ||
      $(".activity-description #intro").first().text() ||
      $("#intro .no-overflow").first().text() ||
      $("#intro").first().text(),
  );

  return {
    assignmentId: String(assignmentId),
    courseName,
    title,
    openedAtText: dates.opened || null,
    dueAtText: dates.due || null,
    cutoffAtText: dates.cutoff || null,
    allowSubmissionsFromText: dates.allowFrom || null,
    descriptionLength: description.length,
    submissionStatusText: statusRows["submission status"] || null,
    gradingStatusText: statusRows["grading status"] || null,
    timeRemainingText: statusRows["time remaining"] || null,
  };
};

const parseEditPage = (html) => {
  const $ = cheerio.load(html);
  const forms = $("form[action*='/mod/assign/view.php'][method='post']");
  let form = null;
  forms.each((_idx, element) => {
    if (form) return;
    const candidate = $(element);
    const action = candidate.find("input[name='action']").attr("value");
    if (action === "savesubmission") {
      form = candidate;
    }
  });
  if (!form && forms.length > 0) {
    form = forms.first();
  }

  if (!form || form.length === 0) {
    return {
      hasForm: false,
      draftItemId: null,
      sesskey: null,
      supportsFileSubmission: false,
      supportsOnlineTextSubmission: false,
      acceptedFileTypes: [],
      maxFiles: null,
      maxBytes: null,
      uploadRepositoryId: null,
      hiddenFieldCount: 0,
    };
  }

  const hiddenFields = {};
  form.find("input[type='hidden'][name]").each((_idx, input) => {
    const name = $(input).attr("name");
    if (!name) return;
    hiddenFields[name] = $(input).attr("value") || "";
  });

  const marker = "M.form_filemanager.init(Y, ";
  const configJsonText = extractJsonObjectAfterMarker(html, marker);
  let config = null;
  if (configJsonText) {
    try {
      config = JSON.parse(configJsonText);
    } catch {
      config = null;
    }
  }

  let uploadRepositoryId = null;
  const repositories = config?.filepicker?.repositories || {};
  for (const [repoKey, repo] of Object.entries(repositories)) {
    if (repo?.type !== "upload") continue;
    uploadRepositoryId = String(repo?.id ?? repoKey);
    break;
  }

  const acceptedFileTypes = Array.from(
    new Set(
      (config?.filepicker?.accepted_types || config?.accepted_types || [])
        .map((item) => normalizeText(String(item).toLowerCase()))
        .filter(Boolean),
    ),
  );

  const onlineTextFieldName =
    form.find("textarea[name*='onlinetext'][name$='[text]']").first().attr("name") ||
    form.find("textarea[name$='[text]']").first().attr("name") ||
    null;

  return {
    hasForm: true,
    draftItemId: hiddenFields.files_filemanager || (config?.itemid ? String(config.itemid) : null),
    sesskey: hiddenFields.sesskey || null,
    supportsFileSubmission: Boolean(hiddenFields.files_filemanager),
    supportsOnlineTextSubmission: Boolean(onlineTextFieldName),
    acceptedFileTypes,
    maxFiles: Number.isFinite(Number(config?.maxfiles)) ? Number(config.maxfiles) : null,
    maxBytes: Number.isFinite(Number(config?.maxbytes)) ? Number(config.maxbytes) : null,
    uploadRepositoryId,
    hiddenFieldCount: Object.keys(hiddenFields).length,
  };
};

const main = async () => {
  console.log("======================================");
  console.log(" ASSIGNMENT SCRAPER TEST");
  console.log("======================================");
  console.log(`Base URL: ${session.baseUrl}`);

  const loggedIn = await session.login();
  if (!loggedIn) {
    throw new Error("Login failed. Check LMS_TEST_USERNAME/LMS_TEST_PASSWORD.");
  }

  for (const assignmentId of ASSIGNMENT_IDS) {
    const viewResponse = await session.fetchWithSession(
      `/mod/assign/view.php?id=${assignmentId}`,
    );
    const viewHtml = await viewResponse.text();
    const viewData = parseAssignmentView(viewHtml, assignmentId);

    const editResponse = await session.fetchWithSession(
      `/mod/assign/view.php?id=${assignmentId}&action=editsubmission`,
    );
    const editHtml = await editResponse.text();
    const editData = parseEditPage(editHtml);

    console.log(`\nAssignment ${assignmentId}`);
    console.log(`  Course: ${viewData.courseName}`);
    console.log(`  Title: ${viewData.title}`);
    console.log(`  Opened: ${viewData.openedAtText || "N/A"}`);
    console.log(`  Due: ${viewData.dueAtText || "N/A"}`);
    console.log(`  Description length: ${viewData.descriptionLength}`);
    console.log(`  Submission status: ${viewData.submissionStatusText || "N/A"}`);
    console.log(`  Grading status: ${viewData.gradingStatusText || "N/A"}`);
    console.log(`  Time remaining: ${viewData.timeRemainingText || "N/A"}`);
    console.log(`  Supports file submit: ${editData.supportsFileSubmission}`);
    console.log(`  Supports online text: ${editData.supportsOnlineTextSubmission}`);
    console.log(`  Draft item id: ${editData.draftItemId || "N/A"}`);
    console.log(`  Accepted file types: ${editData.acceptedFileTypes.join(", ") || "any"}`);
    console.log(`  Max files: ${editData.maxFiles ?? "N/A"}`);
    console.log(`  Max bytes: ${editData.maxBytes ?? "N/A"}`);
    console.log(`  Upload repository id: ${editData.uploadRepositoryId || "N/A"}`);
  }

  console.log("\nDone.");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
