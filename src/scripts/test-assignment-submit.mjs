import {
  createLmsSession,
  isLoginHtml,
  loadEnvFromRoot,
} from "./utils/lms-session.mjs";

const DEFAULT_BASE_URL = "https://lmsug24.iiitkottayam.ac.in";
const DEFAULT_ASSIGNMENT_ID = 4155;

loadEnvFromRoot();

const assignmentId = Number.parseInt(
  process.argv.find((arg) => arg.startsWith("--id="))?.split("=")[1] || "",
  10,
);
const targetAssignmentId = Number.isFinite(assignmentId)
  ? assignmentId
  : DEFAULT_ASSIGNMENT_ID;
const shouldFinalizeSubmit = process.argv.includes("--submit");

const cheerio = await import("cheerio");
const session = createLmsSession({
  baseUrl: process.env.LMS_BASE_URL || DEFAULT_BASE_URL,
});

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const pickUploadFormat = (acceptedTypes) => {
  const normalized = (acceptedTypes || []).map((item) =>
    normalizeText(String(item).toLowerCase()),
  );

  const preferred = [".pdf", ".docx", ".doc", ".rtf", ".odt"];
  const chosenExtension =
    preferred.find((ext) => normalized.includes(ext)) ||
    normalized.find((ext) => ext.startsWith(".")) ||
    ".txt";

  const mimeByExtension = {
    ".pdf": "application/pdf",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".rtf": "application/rtf",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".txt": "text/plain",
  };

  if (chosenExtension === ".pdf") {
    const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 12 Tf 72 72 Td (Bunkialo Upload Test) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000116 00000 n
0000000220 00000 n
trailer << /Size 5 /Root 1 0 R >>
startxref
315
%%EOF`;
    return {
      extension: chosenExtension,
      mime: mimeByExtension[chosenExtension],
      content,
    };
  }

  return {
    extension: chosenExtension,
    mime: mimeByExtension[chosenExtension] || "application/octet-stream",
    content: `Bunkialo assignment upload test @ ${new Date().toISOString()}`,
  };
};

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

const parseEditContext = (html) => {
  const $ = cheerio.load(html);
  const forms = $("form[action*='/mod/assign/view.php'][method='post']");
  let form = null;

  forms.each((_idx, element) => {
    if (form) return;
    const candidate = $(element);
    const actionValue = candidate.find("input[name='action']").attr("value");
    if (actionValue === "savesubmission") {
      form = candidate;
    }
  });
  if (!form && forms.length > 0) {
    form = forms.first();
  }
  if (!form || form.length === 0) {
    throw new Error("Could not find assignment edit form");
  }

  const hiddenFields = {};
  form.find("input[type='hidden'][name]").each((_idx, input) => {
    const name = $(input).attr("name");
    if (!name) return;
    hiddenFields[name] = $(input).attr("value") || "";
  });

  const marker = "M.form_filemanager.init(Y, ";
  const rawConfig = extractJsonObjectAfterMarker(html, marker);
  let fileManagerConfig = null;
  if (rawConfig) {
    try {
      fileManagerConfig = JSON.parse(rawConfig);
    } catch {
      fileManagerConfig = null;
    }
  }

  const repositories = fileManagerConfig?.filepicker?.repositories || {};
  let uploadRepositoryId = null;
  for (const [repoKey, repo] of Object.entries(repositories)) {
    if (repo?.type !== "upload") continue;
    uploadRepositoryId = String(repo?.id ?? repoKey);
    break;
  }

  const onlineTextFieldName =
    form.find("textarea[name*='onlinetext'][name$='[text]']").first().attr("name") ||
    form.find("textarea[name$='[text]']").first().attr("name") ||
    null;

  return {
    hiddenFields,
    formAction: form.attr("action") || "/mod/assign/view.php",
    draftItemId:
      hiddenFields.files_filemanager ||
      (fileManagerConfig?.itemid ? String(fileManagerConfig.itemid) : null),
    sesskey: hiddenFields.sesskey || null,
    clientId: fileManagerConfig?.client_id || null,
    contextId:
      fileManagerConfig?.context?.id !== undefined
        ? String(fileManagerConfig.context.id)
        : null,
    uploadRepositoryId,
    acceptedTypes:
      fileManagerConfig?.filepicker?.accepted_types ||
      fileManagerConfig?.accepted_types ||
      [],
    maxBytes:
      Number.isFinite(Number(fileManagerConfig?.maxbytes)) &&
      Number(fileManagerConfig.maxbytes) > 0
        ? Number(fileManagerConfig.maxbytes)
        : -1,
    onlineTextFieldName,
  };
};

const uploadDraftFile = async (context) => {
  if (!context.draftItemId || !context.uploadRepositoryId || !context.sesskey) {
    throw new Error("Missing file manager metadata for upload");
  }

  const formData = new FormData();
  const format = pickUploadFormat(context.acceptedTypes);
  const blob = new Blob([format.content], { type: format.mime });
  const fileName = `bunkialo-upload-test${format.extension}`;

  formData.append("repo_upload_file", blob, fileName);
  formData.append("title", fileName);
  formData.append("author", "Bunkialo");
  formData.append("license", "unknown");
  for (const type of context.acceptedTypes) {
    formData.append("accepted_types[]", String(type));
  }
  formData.append("repo_id", context.uploadRepositoryId);
  formData.append("p", "");
  formData.append("page", "");
  formData.append("env", "filemanager");
  formData.append("sesskey", context.sesskey);
  if (context.clientId) formData.append("client_id", context.clientId);
  formData.append("itemid", context.draftItemId);
  formData.append("maxbytes", String(context.maxBytes));
  formData.append("areamaxbytes", "-1");
  if (context.contextId) formData.append("ctx_id", context.contextId);
  formData.append("savepath", "/");

  const response = await session.fetchWithSession(
    "/repository/repository_ajax.php?action=upload",
    {
      method: "POST",
      body: formData,
    },
  );
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  if (!payload || payload.error || payload.event === "error") {
    throw new Error(`Draft upload failed: ${text.slice(0, 220)}`);
  }

  return {
    itemId: String(payload.itemid || context.draftItemId),
    fileName: payload.file || payload.title || fileName,
  };
};

const maybeSubmit = async (context, uploadedDraft) => {
  const formFields = new URLSearchParams();
  for (const [name, value] of Object.entries(context.hiddenFields)) {
    formFields.set(name, String(value));
  }

  if (uploadedDraft?.itemId) {
    formFields.set("files_filemanager", uploadedDraft.itemId);
  }

  if (context.onlineTextFieldName) {
    const text = `Uploaded via Bunkialo test script at ${new Date().toISOString()}`;
    formFields.set(context.onlineTextFieldName, text);
    const textFieldMatch = context.onlineTextFieldName.match(/^(.*)\[text\]$/);
    if (textFieldMatch?.[1]) {
      const base = textFieldMatch[1];
      if (!formFields.has(`${base}[format]`)) {
        formFields.set(`${base}[format]`, "1");
      }
      if (!formFields.has(`${base}[itemid]`)) {
        formFields.set(`${base}[itemid]`, uploadedDraft?.itemId || context.draftItemId || "0");
      }
    }
  }

  const response = await session.fetchWithSession(context.formAction, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formFields.toString(),
  });

  const html = await response.text();
  if (isLoginHtml(html)) {
    throw new Error("Submission POST returned login page");
  }

  const $ = cheerio.load(html);
  const status = normalizeText(
    $(".submissionstatustable tr th")
      .filter((_idx, th) => normalizeText($(th).text()).toLowerCase() === "submission status")
      .first()
      .parent()
      .find("td")
      .first()
      .text(),
  );

  return {
    ok: Boolean(status),
    statusText: status || null,
  };
};

const main = async () => {
  console.log("======================================");
  console.log(" ASSIGNMENT SUBMIT FLOW TEST");
  console.log("======================================");
  console.log(`Base URL: ${session.baseUrl}`);
  console.log(`Assignment ID: ${targetAssignmentId}`);
  console.log(`Finalize submit: ${shouldFinalizeSubmit ? "YES" : "NO (dry run)"}`);

  const loggedIn = await session.login();
  if (!loggedIn) {
    throw new Error("Login failed. Check LMS_TEST_USERNAME/LMS_TEST_PASSWORD.");
  }

  const editResponse = await session.fetchWithSession(
    `/mod/assign/view.php?id=${targetAssignmentId}&action=editsubmission`,
  );
  const editHtml = await editResponse.text();
  const context = parseEditContext(editHtml);

  console.log(`Edit form action: ${context.formAction}`);
  console.log(`Draft item id: ${context.draftItemId || "N/A"}`);
  console.log(`Upload repo id: ${context.uploadRepositoryId || "N/A"}`);
  console.log(`Supports online text: ${Boolean(context.onlineTextFieldName)}`);

  if (!context.uploadRepositoryId || !context.draftItemId || !context.sesskey) {
    console.log("Skipping upload: assignment does not expose file upload metadata.");
    return;
  }

  const uploadedDraft = await uploadDraftFile(context);
  console.log(`Draft upload OK: ${uploadedDraft.fileName} (itemid=${uploadedDraft.itemId})`);

  if (!shouldFinalizeSubmit) {
    console.log("Dry run complete. Use --submit to finalize submission.");
    return;
  }

  const submitResult = await maybeSubmit(context, uploadedDraft);
  if (!submitResult.ok) {
    throw new Error("Submission response did not confirm submission status.");
  }

  console.log(`Submission saved. LMS status: ${submitResult.statusText}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
