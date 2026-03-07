import {
  DASHBOARD_BACKGROUND_INTERVAL_MINUTES,
  DASHBOARD_TASK_NAME,
} from "@/constants/dashboard";
import { clearDashboardNotificationState } from "@/services/dashboard-notifications";
import { useDashboardStore } from "@/stores/dashboard-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  cancelAllNotifications,
  hasNotificationPermissions,
  sendImmediateNotification,
} from "@/utils/notifications";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

const notifyDevSyncResult = async (params: {
  success: boolean;
  upcomingCount: number;
  overdueCount: number;
  errorMessage?: string;
}): Promise<void> => {
  if (!__DEV__) {
    return;
  }

  const { devDashboardSyncEnabled } = useSettingsStore.getState();
  if (!devDashboardSyncEnabled) {
    return;
  }

  const hasPermission = await hasNotificationPermissions();
  if (!hasPermission) {
    return;
  }

  const title = params.success ? "Dashboard Sync" : "Dashboard Sync Failed";
  const body = params.success
    ? `Synced ${params.upcomingCount} upcoming, ${params.overdueCount} overdue`
    : `Sync failed${params.errorMessage ? `: ${params.errorMessage}` : ""}`;

  await sendImmediateNotification({ title, body });
};

const runDashboardBackgroundSync =
  async (): Promise<BackgroundTask.BackgroundTaskResult> => {
    const dashboardStore = useDashboardStore.getState();
    const result = await dashboardStore.fetchDashboard({
      silent: true,
      source: "background",
    });

    if (result.ok) {
      await notifyDevSyncResult({
        success: true,
        upcomingCount: result.upcomingCount,
        overdueCount: result.overdueCount,
      });

      return BackgroundTask.BackgroundTaskResult.Success;
    }

    dashboardStore.addLog(`Background sync failed: ${result.error}`, "error");
    await notifyDevSyncResult({
      success: false,
      upcomingCount: 0,
      overdueCount: 0,
      errorMessage: result.error,
    });

    return BackgroundTask.BackgroundTaskResult.Failed;
  };

TaskManager.defineTask(DASHBOARD_TASK_NAME, async () => {
  try {
    return await runDashboardBackgroundSync();
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export const cancelAllScheduledNotifications = async (): Promise<void> => {
  await cancelAllNotifications();
  await clearDashboardNotificationState();
};

export const registerDashboardBackgroundTask = async (): Promise<boolean> => {
  const isTaskManagerAvailable = await TaskManager.isAvailableAsync();
  if (!isTaskManagerAvailable) {
    return false;
  }

  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    return false;
  }

  const isRegistered =
    await TaskManager.isTaskRegisteredAsync(DASHBOARD_TASK_NAME);
  if (isRegistered) {
    await BackgroundTask.unregisterTaskAsync(DASHBOARD_TASK_NAME);
  }

  await BackgroundTask.registerTaskAsync(DASHBOARD_TASK_NAME, {
    minimumInterval: DASHBOARD_BACKGROUND_INTERVAL_MINUTES,
  });

  return true;
};

export const unregisterDashboardBackgroundTask = async (): Promise<void> => {
  const isRegistered =
    await TaskManager.isTaskRegisteredAsync(DASHBOARD_TASK_NAME);
  if (isRegistered) {
    await BackgroundTask.unregisterTaskAsync(DASHBOARD_TASK_NAME);
  }
};

export const syncDashboardBackgroundTask = async (): Promise<boolean> => {
  return registerDashboardBackgroundTask();
};

export const startBackgroundRefresh = (): void => {
  void syncDashboardBackgroundTask();
};

export const stopBackgroundRefresh = (): void => {
  void unregisterDashboardBackgroundTask();
};

export const restartBackgroundRefresh = (): void => {
  void syncDashboardBackgroundTask();
};
