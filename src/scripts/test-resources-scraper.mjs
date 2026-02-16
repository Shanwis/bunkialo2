const cheerio = await import("cheerio");
import { createLmsSession, loadEnvFromRoot } from "./utils/lms-session.mjs";

loadEnvFromRoot();
const session = createLmsSession();
const BASE_URL = session.baseUrl;

function normalizeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function deriveModuleType(className) {
  const match = (className || "").match(/modtype_([a-z0-9_]+)/i);
  return match?.[1]?.toLowerCase() || "unknown";
}

function parseSectionTitle($, section) {
  return normalizeText(
    $(section)
      .find("h3.sectionname, .course-section-header h3, .sectionname, h3")
      .first()
      .text(),
  );
}

function parseItemTitle($, activity) {
  const instName = $(activity).find(".instancename").first();
  const typeLabel = normalizeText(instName.find(".accesshide").text());
  let title = normalizeText(instName.text());

  if (typeLabel && title.toLowerCase().endsWith(typeLabel.toLowerCase())) {
    title = title.slice(0, title.length - typeLabel.length).trim();
  }

  if (title) return title;

  const linkText = normalizeText(
    $(activity).find("a.aalink, a[href*='/mod/']").first().text(),
  );
  return linkText || "Untitled item";
}

function parseCourseTree(html, courseId) {
  const $ = cheerio.load(html);
  const sections = [];

  let sectionNodes = $("li.section.course-section.main");
  if (sectionNodes.length === 0) {
    sectionNodes = $("li.course-section");
  }

  sectionNodes.each((sectionIndex, section) => {
    const sectionId = $(section).attr("id") || `section-${sectionIndex}`;
    const sectionTitle =
      parseSectionTitle($, section) || `Section ${sectionIndex + 1}`;

    const items = [];
    $(section)
      .find("li.activity")
      .each((itemIndex, activity) => {
        const id =
          $(activity).attr("id") || `${sectionId}-item-${itemIndex + 1}`;
        const className = $(activity).attr("class") || "";
        const moduleType = deriveModuleType(className);

        const href =
          $(activity).find("a.aalink[href]").first().attr("href") ||
          $(activity).find("a[href*='/mod/'][href]").first().attr("href") ||
          "";

        const url = session.toAbsoluteUrl(href);
        const title = parseItemTitle($, activity);

        items.push({
          id,
          moduleType,
          title,
          url,
          childrenCount: 0,
        });
      });

    sections.push({
      id: sectionId,
      title: sectionTitle,
      items,
    });
  });

  const courseTitle =
    normalizeText($("h1").first().text()) || `Course ${courseId}`;
  return { courseId, courseTitle, sections };
}

async function parseFolderFiles(folderUrl) {
  const response = await session.fetchWithSession(folderUrl);
  const html = await response.text();
  const $ = cheerio.load(html);

  const files = [];
  const seen = new Set();

  $("main .foldertree a[href], .foldertree a[href]").each((index, link) => {
    const href = $(link).attr("href");
    const url = session.toAbsoluteUrl(href);
    if (!url || seen.has(url)) return;
    seen.add(url);

    const name = normalizeText($(link).text()) || `File ${index + 1}`;
    files.push({ name, url });
  });

  return files;
}

function validateTree(tree) {
  const errors = [];

  for (const section of tree.sections) {
    if (!section.id) {
      errors.push("Section id missing");
    }

    for (const item of section.items) {
      if (!item.id) {
        errors.push(`Item id missing in section ${section.id}`);
      }
      if (!item.url || !item.url.startsWith("http")) {
        errors.push(`Invalid URL for item ${item.id}`);
      }
    }
  }

  return errors;
}

async function analyzeCourse(courseId) {
  console.log(`\n[2] COURSE ${courseId}`);

  const courseRes = await session.fetchWithSession(
    `${BASE_URL}/course/view.php?id=${courseId}`,
  );
  const html = await courseRes.text();

  const tree = parseCourseTree(html, String(courseId));

  const moduleCounts = {};
  let folderCount = 0;
  let folderFileCount = 0;

  for (const section of tree.sections) {
    for (const item of section.items) {
      moduleCounts[item.moduleType] = (moduleCounts[item.moduleType] || 0) + 1;

      if (item.moduleType === "folder") {
        folderCount += 1;
        const files = await parseFolderFiles(item.url);
        item.childrenCount = files.length;
        folderFileCount += files.length;
      }
    }
  }

  const errors = validateTree(tree);

  console.log(`  Title: ${tree.courseTitle}`);
  console.log(`  Sections: ${tree.sections.length}`);
  console.log(
    `  Modules: ${tree.sections.reduce((sum, s) => sum + s.items.length, 0)}`,
  );
  console.log(`  Module type counts: ${JSON.stringify(moduleCounts)}`);
  console.log(`  Folders: ${folderCount} (files: ${folderFileCount})`);

  if (errors.length > 0) {
    console.log(`  Validation errors: ${errors.length}`);
    errors.forEach((error) => console.log(`    - ${error}`));
    throw new Error(`Validation failed for course ${courseId}`);
  }

  console.log("  Validation: OK (stable IDs + URLs)");
}

async function main() {
  console.log("======================================");
  console.log("  LMS RESOURCES SCRAPER TEST");
  console.log("======================================");

  try {
    console.log("\n[1] LOGIN");
    const loginOk = await session.login();
    const cookieCount = await session.getCookieCount();
    console.log(`  Result: ${loginOk ? "SUCCESS" : "FAILED"} (cookies=${cookieCount})`);
    if (!loginOk) {
      process.exit(1);
    }

    await analyzeCourse(119);
    await analyzeCourse(123);

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
