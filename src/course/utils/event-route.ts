import type { TimelineEvent } from "@/types";
import {
  getQueryParamValue,
  parseAssignmentIdFromMoodleUrl,
} from "@/utils/moodle-url";

const parseCourseIdFromUrl = (url: string): string | null => {
  if (!url) return null;

  const courseIdParam = getQueryParamValue(url, "course");
  if (courseIdParam) return courseIdParam;

  const viewId = getQueryParamValue(url, "id");
  if (viewId && url.includes("/course/view.php")) return viewId;

  return null;
};

export const parseAssignmentIdFromUrl = (url: string): string | null => {
  return parseAssignmentIdFromMoodleUrl(url);
};

export const resolveEventCourseId = (event: TimelineEvent): string | null => {
  if (event.course?.id !== undefined && event.course?.id !== null) {
    return String(event.course.id);
  }

  const fromViewUrl = parseCourseIdFromUrl(event.course?.viewurl ?? "");
  if (fromViewUrl) return fromViewUrl;

  return parseCourseIdFromUrl(event.url ?? "");
};

export type DashboardEventRoute =
  | {
      type: "assignment";
      courseId: string;
      assignmentId: string;
    }
  | {
      type: "course";
      courseId: string;
    }
  | {
      type: "unresolved";
    };

export const resolveDashboardEventRoute = (
  event: TimelineEvent,
): DashboardEventRoute => {
  const courseId = resolveEventCourseId(event);
  if (!courseId) return { type: "unresolved" };

  const isAssignment = event.modulename?.toLowerCase() === "assign";
  if (isAssignment) {
    const assignmentId = parseAssignmentIdFromUrl(event.url ?? "");
    if (assignmentId) {
      return {
        type: "assignment",
        courseId,
        assignmentId,
      };
    }
  }

  return {
    type: "course",
    courseId,
  };
};
