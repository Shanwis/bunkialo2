import {
  DASHBOARD_NOTIFICATION_CHANNELS,
  DASHBOARD_NOTIFICATION_STORAGE_KEY,
} from "@/constants/dashboard";
import type { TimelineEvent } from "@/types";
import {
  cancelNotificationRequests,
  ensureNotificationChannels,
  hasNotificationPermissions,
  scheduleDateNotification,
  sendImmediateNotification,
} from "@/utils/notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

type DashboardSyncSource = "foreground" | "background";

type DashboardNotificationState = {
  seenUpcomingSignatures: string[];
  scheduledReminderIds: Record<string, string[]>;
};

type SyncDashboardNotificationsParams = {
  notificationsEnabled: boolean;
  reminderMinutes: number[];
  source: DashboardSyncSource;
  upcomingEvents: TimelineEvent[];
};

const EMPTY_NOTIFICATION_STATE: DashboardNotificationState = {
  seenUpcomingSignatures: [],
  scheduledReminderIds: {},
};

const getEventSignature = (event: TimelineEvent): string =>
  `${event.id}:${event.timesort}`;

const loadDashboardNotificationState =
  async (): Promise<DashboardNotificationState> => {
    const raw = await AsyncStorage.getItem(DASHBOARD_NOTIFICATION_STORAGE_KEY);
    if (!raw) {
      return EMPTY_NOTIFICATION_STATE;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<DashboardNotificationState>;
      return {
        seenUpcomingSignatures: Array.isArray(parsed.seenUpcomingSignatures)
          ? parsed.seenUpcomingSignatures
          : [],
        scheduledReminderIds:
          parsed.scheduledReminderIds &&
          typeof parsed.scheduledReminderIds === "object"
            ? parsed.scheduledReminderIds
            : {},
      };
    } catch {
      return EMPTY_NOTIFICATION_STATE;
    }
  };

const saveDashboardNotificationState = async (
  state: DashboardNotificationState,
): Promise<void> => {
  await AsyncStorage.setItem(
    DASHBOARD_NOTIFICATION_STORAGE_KEY,
    JSON.stringify(state),
  );
};

const buildNewUpcomingNotification = (
  newUpcomingEvents: TimelineEvent[],
): { title: string; body: string } | null => {
  if (newUpcomingEvents.length === 0) {
    return null;
  }

  const [firstEvent] = newUpcomingEvents;
  if (!firstEvent) {
    return null;
  }

  if (newUpcomingEvents.length === 1) {
    return {
      title: "New upcoming task",
      body: `${firstEvent.activityname} in ${firstEvent.course.shortname}`,
    };
  }

  return {
    title: `${newUpcomingEvents.length} new upcoming tasks`,
    body: `Latest: ${firstEvent.activityname} in ${firstEvent.course.shortname}`,
  };
};

const scheduleReminderNotifications = async (
  upcomingEvents: TimelineEvent[],
  reminderMinutes: number[],
): Promise<Record<string, string[]>> => {
  const scheduledReminderIds: Record<string, string[]> = {};

  for (const event of upcomingEvents) {
    const signature = getEventSignature(event);
    const notificationIds: string[] = [];

    for (const minutesBefore of reminderMinutes) {
      const scheduledAt = event.timesort * 1000 - minutesBefore * 60 * 1000;
      if (scheduledAt <= Date.now()) {
        continue;
      }

      const notificationId = await scheduleDateNotification({
        body: `Due in ${minutesBefore} minutes - ${event.course.shortname}`,
        channelId: DASHBOARD_NOTIFICATION_CHANNELS.reminders,
        data: {
          eventId: event.id,
          reminderMinutes: minutesBefore,
          type: "dashboard-reminder",
          url: event.url,
        },
        date: scheduledAt,
        title: event.activityname,
      });

      notificationIds.push(notificationId);
    }

    if (notificationIds.length > 0) {
      scheduledReminderIds[signature] = notificationIds;
    }
  }

  return scheduledReminderIds;
};

export const clearDashboardNotificationState = async (): Promise<void> => {
  const state = await loadDashboardNotificationState();
  const notificationIds = Object.values(state.scheduledReminderIds).flat();

  if (notificationIds.length > 0) {
    await cancelNotificationRequests(notificationIds);
  }

  await AsyncStorage.removeItem(DASHBOARD_NOTIFICATION_STORAGE_KEY);
};

export const syncDashboardNotifications = async ({
  notificationsEnabled,
  reminderMinutes,
  source,
  upcomingEvents,
}: SyncDashboardNotificationsParams): Promise<{
  newUpcomingEvents: TimelineEvent[];
}> => {
  const previousState = await loadDashboardNotificationState();
  const previousSignatures = new Set(previousState.seenUpcomingSignatures);
  const currentSignatures = new Set(upcomingEvents.map(getEventSignature));
  const hasSeenBaseline = previousState.seenUpcomingSignatures.length > 0;

  const staleReminderIds = Object.entries(previousState.scheduledReminderIds)
    .filter(([signature]) => !currentSignatures.has(signature))
    .flatMap(([, ids]) => ids);

  if (staleReminderIds.length > 0) {
    await cancelNotificationRequests(staleReminderIds);
  }

  const newUpcomingEvents = hasSeenBaseline
    ? upcomingEvents.filter(
        (event) => !previousSignatures.has(getEventSignature(event)),
      )
    : [];

  const shouldSendNotifications =
    notificationsEnabled && (await hasNotificationPermissions());

  if (!shouldSendNotifications) {
    const existingReminderIds = Object.values(
      previousState.scheduledReminderIds,
    ).flat();
    if (existingReminderIds.length > 0) {
      await cancelNotificationRequests(existingReminderIds);
    }

    await saveDashboardNotificationState({
      seenUpcomingSignatures: Array.from(currentSignatures),
      scheduledReminderIds: {},
    });

    return { newUpcomingEvents: [] };
  }

  await ensureNotificationChannels([
    {
      id: DASHBOARD_NOTIFICATION_CHANNELS.default,
      name: "Default",
    },
    {
      id: DASHBOARD_NOTIFICATION_CHANNELS.reminders,
      name: "Dashboard reminders",
    },
    {
      id: DASHBOARD_NOTIFICATION_CHANNELS.updates,
      name: "Dashboard updates",
    },
  ]);

  const currentReminderIds = Object.values(
    previousState.scheduledReminderIds,
  ).flat();
  if (currentReminderIds.length > 0) {
    await cancelNotificationRequests(currentReminderIds);
  }

  const scheduledReminderIds = await scheduleReminderNotifications(
    upcomingEvents,
    reminderMinutes,
  );

  if (source === "background" && newUpcomingEvents.length > 0) {
    const summary = buildNewUpcomingNotification(newUpcomingEvents);

    if (summary) {
      await sendImmediateNotification({
        body: summary.body,
        channelId: DASHBOARD_NOTIFICATION_CHANNELS.updates,
        data: {
          eventIds: newUpcomingEvents.map((event) => event.id),
          type: "dashboard-update",
        },
        title: summary.title,
      });
    }
  }

  await saveDashboardNotificationState({
    seenUpcomingSignatures: Array.from(currentSignatures),
    scheduledReminderIds,
  });

  return { newUpcomingEvents };
};
