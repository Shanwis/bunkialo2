import { checkSession, tryAutoLogin } from "@/services/auth";
import { api, getCurrentBaseUrl } from "@/services/api";
import { fetchCourses } from "@/services/scraper";
import {
  getAttr,
  getText,
  parseHtml,
  querySelector,
  querySelectorAll,
} from "@/utils/html-parser";
import { debug } from "@/utils/debug";
import type { Element } from "domhandler";

type FeedbackAutofillOptions = {
  defaultGrade: string;
  defaultTextResponse: string;
  submit?: boolean;
  parallelism?: number;
  onProgress?: (progress: FeedbackAutofillProgress) => void;
};

export type FeedbackAutofillProgress = {
  stage: "start" | "course" | "done";
  totalCourses: number;
  courseIndex: number;
  courseTitle: string;
  coursesProcessed: number;
  feedbackFormsVisited: number;
  formsAttempted: number;
  formsSubmitted: number;
};

export type FeedbackAutofillReport = {
  coursesDiscovered: number;
  coursesProcessed: number;
  feedbackLinksDiscovered: number;
  feedbackFormsVisited: number;
  formsAttempted: number;
  formsSubmitted: number;
  formsSkippedNoQuestions: number;
  radioGroupsFilled: number;
  checkboxGroupsFilled: number;
  textFieldsFilled: number;
  errors: string[];
};

type FillResult = {
  submitted: boolean;
  hadQuestions: boolean;
  radioGroupsFilled: number;
  checkboxGroupsFilled: number;
  textFieldsFilled: number;
};

const isLoginHtml = (html: string): boolean => {
  const normalized = html.replace(/\s+/g, " ");
  return (
    normalized.includes('name="logintoken"') ||
    normalized.includes('id="login"') ||
    normalized.includes("/login/index.php")
  );
};

const toAbsoluteUrl = (href: string): string => {
  const baseUrl = getCurrentBaseUrl();
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
};

const isDisabledField = (node: Element): boolean => {
  return getAttr(node, "disabled") !== null;
};

const collectFeedbackLinks = (html: string): string[] => {
  const doc = parseHtml(html);
  const links = querySelectorAll(doc, "a[href]")
    .map((node) => {
      const href = getAttr(node, "href") || "";
      const label = getText(node).toLowerCase();
      return {
        href: toAbsoluteUrl(href),
        label,
      };
    })
    .filter(
      (entry) =>
        /\/mod\/feedback\/(view|complete)\.php\?id=\d+/i.test(entry.href) ||
        (/feedback/i.test(entry.label) && /\/mod\//i.test(entry.href)),
    )
    .map((entry) => entry.href);
  return Array.from(new Set(links));
};

const appendHiddenFields = (form: Element, params: URLSearchParams) => {
  const hiddenInputs = querySelectorAll(form, "input[type='hidden'][name]");
  for (const input of hiddenInputs) {
    const name = getAttr(input, "name");
    if (!name) continue;
    const value = getAttr(input, "value") || "";
    params.set(name, value);
  }
};

const appendSubmitButtonField = (form: Element, params: URLSearchParams) => {
  const submitInput = querySelector(form, "input[type='submit'][name]");
  if (submitInput) {
    const name = getAttr(submitInput, "name");
    if (name) {
      params.set(name, getAttr(submitInput, "value") || "1");
      return;
    }
  }

  const submitButton = querySelector(form, "button[type='submit'][name]");
  if (submitButton) {
    const name = getAttr(submitButton, "name");
    if (name) {
      params.set(
        name,
        getAttr(submitButton, "value") || getText(submitButton) || "1",
      );
    }
  }
};

const applyQuestionDefaults = (
  form: Element,
  params: URLSearchParams,
  defaultGrade: string,
  defaultTextResponse: string,
): Omit<FillResult, "submitted"> => {
  const radios = querySelectorAll(form, "input[type='radio'][name]").filter(
    (node) => !isDisabledField(node),
  );
  const radioByName = new Map<string, Element[]>();
  for (const radio of radios) {
    const name = getAttr(radio, "name");
    if (!name) continue;
    const group = radioByName.get(name) || [];
    group.push(radio);
    radioByName.set(name, group);
  }

  let radioGroupsFilled = 0;
  for (const [name, group] of radioByName) {
    const preferred =
      group.find((node) => (getAttr(node, "value") || "") === defaultGrade) ||
      group[2] ||
      group[0];
    if (!preferred) continue;
    const value = getAttr(preferred, "value") || "";
    params.set(name, value);
    radioGroupsFilled += 1;
  }

  const checkboxes = querySelectorAll(
    form,
    "input[type='checkbox'][name]",
  ).filter((node) => !isDisabledField(node));
  const checkboxByName = new Map<string, Element[]>();
  for (const checkbox of checkboxes) {
    const name = getAttr(checkbox, "name");
    if (!name) continue;
    const group = checkboxByName.get(name) || [];
    group.push(checkbox);
    checkboxByName.set(name, group);
  }

  let checkboxGroupsFilled = 0;
  for (const [name, group] of checkboxByName) {
    const selected = group.slice(0, Math.min(3, group.length));
    if (selected.length === 0) continue;
    params.delete(name);
    for (const checkbox of selected) {
      params.append(name, getAttr(checkbox, "value") || "1");
    }
    checkboxGroupsFilled += 1;
  }

  const textFields = [
    ...querySelectorAll(form, "textarea[name]"),
    ...querySelectorAll(
      form,
      "input[type='text'][name], input:not([type])[name]",
    ),
  ].filter(
    (node) => !isDisabledField(node) && getAttr(node, "readonly") === null,
  );

  let textFieldsFilled = 0;
  for (const field of textFields) {
    const name = getAttr(field, "name");
    if (!name) continue;
    const existing = getAttr(field, "value") || "";
    const value = existing.trim() || defaultTextResponse;
    params.set(name, value);
    if (!existing.trim()) {
      textFieldsFilled += 1;
    }
  }

  return {
    hadQuestions: true,
    radioGroupsFilled,
    checkboxGroupsFilled,
    textFieldsFilled,
  };
};

const findQuestionForm = (html: string): Element | null => {
  const doc = parseHtml(html);
  const forms = querySelectorAll(doc, "form");

  for (const form of forms) {
    const hasQuestions =
      querySelector(form, "input[type='radio'][name]") !== null ||
      querySelector(form, "input[type='checkbox'][name]") !== null ||
      querySelector(form, "textarea[name]") !== null ||
      querySelector(form, "input[type='text'][name]") !== null ||
      querySelector(form, "input:not([type])[name]") !== null;
    const hasSubmit =
      querySelector(form, "button[type='submit'], input[type='submit']") !==
      null;
    if (hasQuestions && hasSubmit) {
      return form;
    }
  }

  return null;
};

const findConfirmationForm = (html: string): Element | null => {
  const doc = parseHtml(html);
  const forms = querySelectorAll(doc, "form");
  for (const form of forms) {
    const hasSubmit =
      querySelector(form, "button[type='submit'], input[type='submit']") !==
      null;
    const hasQuestions =
      querySelector(form, "input[type='radio'][name]") !== null ||
      querySelector(form, "input[type='checkbox'][name]") !== null ||
      querySelector(form, "textarea[name]") !== null;
    if (hasSubmit && !hasQuestions) {
      return form;
    }
  }
  return null;
};

const getFormActionUrl = (form: Element, currentUrl: string): string => {
  const action = getAttr(form, "action") || currentUrl;
  return toAbsoluteUrl(action);
};

const resolveCompletionUrl = (
  feedbackPageUrl: string,
  html: string,
): string => {
  const doc = parseHtml(html);
  const completionLink = querySelector(
    doc,
    "a[href*='/mod/feedback/complete.php'], a[href*='complete.php?id=']",
  );
  if (!completionLink) return feedbackPageUrl;
  const href = getAttr(completionLink, "href");
  if (!href) return feedbackPageUrl;
  return toAbsoluteUrl(href);
};

const fallbackCompletionUrl = (feedbackPageUrl: string): string => {
  const idMatch = feedbackPageUrl.match(/[?&]id=(\d+)/);
  if (!idMatch?.[1]) return feedbackPageUrl;
  return toAbsoluteUrl(`/mod/feedback/complete.php?id=${idMatch[1]}`);
};

const isFeedbackForm = (form: Element): boolean => {
  const action = getAttr(form, "action") || "";
  const hasFeedbackAction = /\/mod\/feedback\/(complete|view)\.php/i.test(
    action,
  );
  const hasSubmitValues =
    querySelector(form, "input[name='savevalues']") !== null;
  const hasQuestionFields =
    querySelector(form, "input[type='radio'][name]") !== null ||
    querySelector(form, "input[type='checkbox'][name]") !== null ||
    querySelector(form, "textarea[name]") !== null;
  return hasQuestionFields && (hasFeedbackAction || hasSubmitValues);
};

const submitFeedbackForm = async (
  pageUrl: string,
  html: string,
  defaultGrade: string,
  defaultTextResponse: string,
  submit: boolean,
): Promise<FillResult> => {
  const doc = parseHtml(html);
  const explicitForm = querySelectorAll(doc, "form").find((form) =>
    isFeedbackForm(form),
  );
  const questionForm = explicitForm ?? findQuestionForm(html);
  if (!questionForm) {
    return {
      submitted: false,
      hadQuestions: false,
      radioGroupsFilled: 0,
      checkboxGroupsFilled: 0,
      textFieldsFilled: 0,
    };
  }

  const payload = new URLSearchParams();
  appendHiddenFields(questionForm, payload);
  appendSubmitButtonField(questionForm, payload);

  const fill = applyQuestionDefaults(
    questionForm,
    payload,
    defaultGrade,
    defaultTextResponse,
  );

  if (!submit) {
    return {
      ...fill,
      submitted: false,
      hadQuestions: true,
    };
  }

  const actionUrl = getFormActionUrl(questionForm, pageUrl);
  const submitResponse = await api.post<string>(actionUrl, payload.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (isLoginHtml(submitResponse.data)) {
    throw new Error("Session expired while submitting feedback form");
  }

  const confirmationForm = findConfirmationForm(submitResponse.data);
  if (confirmationForm) {
    const confirmPayload = new URLSearchParams();
    appendHiddenFields(confirmationForm, confirmPayload);
    appendSubmitButtonField(confirmationForm, confirmPayload);
    const confirmationAction = getFormActionUrl(confirmationForm, actionUrl);
    await api.post<string>(confirmationAction, confirmPayload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  }

  return {
    ...fill,
    submitted: true,
    hadQuestions: true,
  };
};

const ensureAuthenticatedSession = async (): Promise<boolean> => {
  const valid = await checkSession();
  if (valid) return true;
  return tryAutoLogin();
};

export const runLmsFeedbackAutofill = async (
  options: FeedbackAutofillOptions,
): Promise<FeedbackAutofillReport> => {
  const defaultGrade = /^[0-5]$/.test(options.defaultGrade.trim())
    ? options.defaultGrade.trim()
    : "3";
  const defaultTextResponse = options.defaultTextResponse.trim() || "_";
  const submit = options.submit ?? true;
  const onProgress = options.onProgress;

  const report: FeedbackAutofillReport = {
    coursesDiscovered: 0,
    coursesProcessed: 0,
    feedbackLinksDiscovered: 0,
    feedbackFormsVisited: 0,
    formsAttempted: 0,
    formsSubmitted: 0,
    formsSkippedNoQuestions: 0,
    radioGroupsFilled: 0,
    checkboxGroupsFilled: 0,
    textFieldsFilled: 0,
    errors: [],
  };

  const ready = await ensureAuthenticatedSession();
  if (!ready) {
    throw new Error("Not authenticated. Please log in again.");
  }

  const courses = await fetchCourses();
  const courseEntries = Array.from(
    new Map(
      courses.map((course) => [
        toAbsoluteUrl(course.url),
        { title: course.name, url: toAbsoluteUrl(course.url) },
      ]),
    ).values(),
  );
  report.coursesDiscovered = courseEntries.length;

  const emitProgress = (
    stage: FeedbackAutofillProgress["stage"],
    courseIndex: number,
    courseTitle: string,
  ) => {
    onProgress?.({
      stage,
      totalCourses: courseEntries.length,
      courseIndex,
      courseTitle,
      coursesProcessed: report.coursesProcessed,
      feedbackFormsVisited: report.feedbackFormsVisited,
      formsAttempted: report.formsAttempted,
      formsSubmitted: report.formsSubmitted,
    });
  };

  emitProgress("start", 0, "");

  debug.scraper(
    `Feedback autofill start: courses=${courseEntries.length}, submit=${submit}`,
  );

  const workerTarget =
    options.parallelism && options.parallelism > 0
      ? options.parallelism
      : courseEntries.length;
  const workerCount = Math.max(1, Math.min(workerTarget, courseEntries.length));
  let nextCourseIndex = 0;

  const processCourse = async (
    entry: { title: string; url: string },
    index: number,
  ) => {
    try {
      const coursePage = await api.get<string>(entry.url);
      if (isLoginHtml(coursePage.data)) {
        throw new Error("Session expired while loading course page");
      }

      report.coursesProcessed += 1;
      const feedbackLinks = collectFeedbackLinks(coursePage.data);
      report.feedbackLinksDiscovered += feedbackLinks.length;

      for (const feedbackUrl of feedbackLinks) {
        try {
          report.feedbackFormsVisited += 1;
          const feedbackPage = await api.get<string>(feedbackUrl);
          if (isLoginHtml(feedbackPage.data)) {
            throw new Error("Session expired while opening feedback page");
          }

          const completionUrl = resolveCompletionUrl(
            feedbackUrl,
            feedbackPage.data,
          );
          const preferredCompletionUrl =
            completionUrl === feedbackUrl
              ? fallbackCompletionUrl(feedbackUrl)
              : completionUrl;

          const completionPage =
            preferredCompletionUrl === feedbackUrl
              ? feedbackPage
              : await api.get<string>(preferredCompletionUrl);

          if (isLoginHtml(completionPage.data)) {
            throw new Error("Session expired while opening feedback form");
          }

          const fillResult = await submitFeedbackForm(
            preferredCompletionUrl,
            completionPage.data,
            defaultGrade,
            defaultTextResponse,
            submit,
          );

          if (!fillResult.hadQuestions) {
            report.formsSkippedNoQuestions += 1;
            continue;
          }

          if (
            fillResult.radioGroupsFilled > 0 ||
            fillResult.checkboxGroupsFilled > 0 ||
            fillResult.textFieldsFilled > 0
          ) {
            report.formsAttempted += 1;
            report.radioGroupsFilled += fillResult.radioGroupsFilled;
            report.checkboxGroupsFilled += fillResult.checkboxGroupsFilled;
            report.textFieldsFilled += fillResult.textFieldsFilled;
            if (fillResult.submitted) {
              report.formsSubmitted += 1;
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          report.errors.push(`${feedbackUrl}: ${message}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.errors.push(`${entry.url}: ${message}`);
    } finally {
      emitProgress("course", index + 1, entry.title);
    }
  };

  const worker = async () => {
    while (nextCourseIndex < courseEntries.length) {
      const index = nextCourseIndex;
      nextCourseIndex += 1;
      const entry = courseEntries[index];
      if (!entry) return;
      await processCourse(entry, index);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  emitProgress("done", courseEntries.length, "");

  debug.scraper("Feedback autofill completed", report);
  return report;
};
