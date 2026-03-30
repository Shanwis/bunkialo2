import type {
    BunkxAttendancePayload,
    BunkxAttendanceRow,
    CourseAttendance,
} from "@/types";
import { extractCourseCode, extractCourseName } from "@/utils/course-name";

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
};

const parsePeriodDate = (rawDate: string, fallbackMs: number): string => {
  const dateMatch = rawDate.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!dateMatch) {
    return toIsoDate(new Date(fallbackMs));
  }

  const day = Number(dateMatch[1]);
  const month = MONTHS[dateMatch[2].toLowerCase()];
  const year = Number(dateMatch[3]);
  if (month === undefined) {
    return toIsoDate(new Date(fallbackMs));
  }

  const parsed = new Date(year, month, day);
  if (isNaN(parsed.getTime())) {
    return toIsoDate(new Date(fallbackMs));
  }

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return toIsoDate(new Date(fallbackMs));
  }

  return toIsoDate(parsed);
};

const parseSessionTime = (rawDate: string): string => {
  const timeMatch = rawDate.match(
    /(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i,
  );
  if (!timeMatch) {
    return "";
  }

  const start = timeMatch[1].replace(/\s+/g, " ").trim().toUpperCase();
  const end = timeMatch[2].replace(/\s+/g, " ").trim().toUpperCase();
  return `${start} - ${end}`;
};

const parseFacultyDetails = (
  description: string,
  remarks?: string,
): { faculty: string; faculty_email: string } => {
  const source = `${description} ${remarks ?? ""}`.trim();

  const facultyLabelMatch = source.match(
    /(?:faculty|teacher|staff|by)\s*[:\-]\s*([^,;|]+)/i,
  );
  const facultyFromLabel = facultyLabelMatch?.[1]?.trim();

  return {
    faculty: facultyFromLabel || "Unknown",
    faculty_email: "",
  };
};

const normalizeScore = (points: string, status: string): string => {
  const compact = points.replace(/\s+/g, "").trim();
  if (compact) {
    if (compact.indexOf("?") !== -1) return "?/1";
    return compact;
  }

  if (status === "Present") return "1/1";
  if (status === "Unknown") return "?/1";
  return "0/1";
};

const toAttendanceRows = (
  courses: CourseAttendance[],
  fallbackMs: number,
): BunkxAttendanceRow[] => {
  const rows: BunkxAttendanceRow[] = [];

  courses.forEach((course: CourseAttendance) => {
    const course_code = extractCourseCode(course.courseName);
    const subject_name = extractCourseName(course.courseName);
    const mergedCourseName = `${course_code} ${subject_name}`.trim();

    course.records.forEach((record, recordIndex) => {
      const { faculty, faculty_email } = parseFacultyDetails(
        record.description,
        record.remarks,
      );

      rows.push({
        period_date: parsePeriodDate(record.date, fallbackMs),
        session_time: parseSessionTime(record.date),
        course_code,
        subject_name,
        faculty,
        faculty_email,
        course: mergedCourseName,
        score: normalizeScore(record.points, record.status),
        record_id: `${course.courseId}-${recordIndex + 1}`,
      });
    });
  });
  return rows;
};

export const buildBunkxAttendancePayload = (
  courses: CourseAttendance[],
  lastSyncTime: number | null,
): BunkxAttendancePayload => {
  const nowMs = Date.now();
  const referenceMs = Math.max(nowMs, lastSyncTime ?? nowMs);
  const expiresAtMs = referenceMs + 30 * 60 * 1000;

  return {
    attendance_rows: toAttendanceRows(courses, referenceMs),
    dataset_id: `bunkialo-${referenceMs}`,
    dataset_expires_at: new Date(expiresAtMs).toISOString(),
  };
};

const encodeBytesToBase64 = (bytes: number[]): string => {
  const base64Chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const chunk =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);

    encoded += base64Chars[(chunk >> 18) & 63];
    encoded += base64Chars[(chunk >> 12) & 63];
    encoded += i + 1 < bytes.length ? base64Chars[(chunk >> 6) & 63] : "=";
    encoded += i + 2 < bytes.length ? base64Chars[chunk & 63] : "=";
  }

  return encoded;
};

export const encodeBunkxPayload = (payload: BunkxAttendancePayload): string => {
  const json = JSON.stringify(payload);
  const uriEncoded = encodeURIComponent(json);
  const bytes: number[] = [];

  let index = 0;
  while (index < uriEncoded.length) {
    const char = uriEncoded.charAt(index);
    if (char === "%" && index + 2 < uriEncoded.length) {
      bytes.push(parseInt(uriEncoded.substr(index + 1, 2), 16));
      index += 3;
      continue;
    }

    bytes.push(uriEncoded.charCodeAt(index));
    index += 1;
  }

  return encodeBytesToBase64(bytes);
};
