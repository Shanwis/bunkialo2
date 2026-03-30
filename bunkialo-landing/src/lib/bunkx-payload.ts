export interface BunkxAttendanceRow {
  period_date: string;
  session_time: string;
  course_code: string;
  subject_name: string;
  faculty: string;
  faculty_email: string;
  course?: string;
  score: string;
  record_id?: string;
}

export interface BunkxAttendancePayload {
  attendance_rows: BunkxAttendanceRow[];
  dataset_id?: string;
  dataset_expires_at?: string;
}

const parseString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${field}`);
  }
  return value;
};

const parseOptionalString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseRow = (value: unknown): BunkxAttendanceRow => {
  if (!isRecord(value)) {
    throw new Error("Invalid attendance row");
  }

  return {
    period_date: parseString(value.period_date, "period_date"),
    session_time: parseString(value.session_time, "session_time"),
    course_code: parseString(value.course_code, "course_code"),
    subject_name: parseString(value.subject_name, "subject_name"),
    faculty: parseString(value.faculty, "faculty"),
    faculty_email: parseString(value.faculty_email, "faculty_email"),
    course: parseOptionalString(value.course),
    score: parseString(value.score, "score"),
    record_id: parseOptionalString(value.record_id),
  };
};

export const parseBunkxAttendancePayload = (
  value: unknown,
): BunkxAttendancePayload => {
  if (!isRecord(value)) {
    throw new Error("Payload must be an object");
  }

  const rows = value.attendance_rows;
  if (!Array.isArray(rows)) {
    throw new Error("attendance_rows must be an array");
  }

  return {
    attendance_rows: rows.map(parseRow),
    dataset_id: parseOptionalString(value.dataset_id),
    dataset_expires_at: parseOptionalString(value.dataset_expires_at),
  };
};
