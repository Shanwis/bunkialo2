/**
 * Dashboard/Timeline types
 */

export interface TimelineCourse {
  id: number;
  fullname: string;
  shortname: string;
  viewurl: string;
}

export interface TimelineEventAction {
  name: string;
  url: string;
  actionable: boolean;
}

export interface TimelineEvent {
  id: number;
  name: string;
  activityname: string;
  activitystr: string;
  modulename: string;
  instance: number;
  eventtype: string;
  timestart: number;
  timesort: number;
  overdue: boolean;
  course: TimelineCourse;
  action: TimelineEventAction;
  url: string;
  purpose: string;
}

export interface DashboardLog {
  id: string;
  timestamp: number;
  message: string;
  type: "info" | "error" | "success";
}

export type DashboardBackgroundTaskAvailability =
  | "unknown"
  | "available"
  | "restricted";

export type DashboardBackgroundTaskResult = "idle" | "success" | "failed";

export interface DashboardBackgroundActivity {
  availability: DashboardBackgroundTaskAvailability;
  isRegistered: boolean;
  lastAttemptAt: number | null;
  lastCompletedAt: number | null;
  lastError: string | null;
  lastOverdueCount: number | null;
  lastResult: DashboardBackgroundTaskResult;
  lastUpcomingCount: number | null;
}

export interface DashboardState {
  backgroundActivity: DashboardBackgroundActivity;
  events: TimelineEvent[];
  lastSyncTime: number | null;
  isLoading: boolean;
  error: string | null;
  logs: DashboardLog[];
}

export interface DashboardSettings {
  backgroundSyncActivityEnabled: boolean;
  refreshIntervalMinutes: number;
  reminders: number[];
  notificationsEnabled: boolean;
  devDashboardSyncEnabled: boolean;
}
