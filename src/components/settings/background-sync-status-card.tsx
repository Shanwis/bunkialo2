import { DASHBOARD_BACKGROUND_INTERVAL_MINUTES } from "@/constants/dashboard";
import { Colors } from "@/constants/theme";
import type { DashboardBackgroundActivity } from "@/types";
import { Text, View } from "react-native";

type BackgroundSyncStatusCardProps = {
  activity: DashboardBackgroundActivity;
  theme: typeof Colors.light;
};

const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) {
    return "Not yet";
  }

  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getAvailabilityLabel = (
  availability: DashboardBackgroundActivity["availability"],
): string => {
  if (availability === "available") {
    return "Available";
  }

  if (availability === "restricted") {
    return "Restricted";
  }

  return "Checking";
};

const getResultLabel = (activity: DashboardBackgroundActivity): string => {
  if (activity.lastResult === "success") {
    return `${activity.lastUpcomingCount ?? 0} upcoming, ${activity.lastOverdueCount ?? 0} overdue`;
  }

  if (activity.lastResult === "failed") {
    return activity.lastError ?? "Failed";
  }

  return "Waiting for first background run";
};

const getResultColor = (
  activity: DashboardBackgroundActivity,
  theme: typeof Colors.light,
): string => {
  if (activity.lastResult === "success") {
    return Colors.status.success;
  }

  if (activity.lastResult === "failed") {
    return Colors.status.danger;
  }

  return theme.textSecondary;
};

const StatusRow = ({
  label,
  value,
  valueColor,
  theme,
}: {
  label: string;
  value: string;
  valueColor?: string;
  theme: typeof Colors.light;
}) => (
  <View className="flex-row items-center justify-between gap-3 py-2">
    <Text className="text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>
      {label}
    </Text>
    <Text
      className="max-w-[65%] text-right text-sm"
      style={{ color: valueColor ?? theme.text }}
      numberOfLines={2}
    >
      {value}
    </Text>
  </View>
);

export const BackgroundSyncStatusCard = ({
  activity,
  theme,
}: BackgroundSyncStatusCardProps) => (
  <View
    className="mt-3 rounded-xl border px-4 py-3"
    style={{ borderColor: theme.border, backgroundColor: theme.surface }}
  >
    <Text className="text-sm font-semibold" style={{ color: theme.text }}>
      Background Sync Activity
    </Text>
    <Text className="mt-1 text-xs" style={{ color: theme.textSecondary }}>
      The OS chooses the exact run time. {DASHBOARD_BACKGROUND_INTERVAL_MINUTES}
      {" "}
      minutes is the minimum interval, not a guarantee.
    </Text>

    <View className="mt-3">
      <StatusRow
        label="Service"
        value={getAvailabilityLabel(activity.availability)}
        theme={theme}
      />
      <StatusRow
        label="Registered"
        value={activity.isRegistered ? "Yes" : "No"}
        theme={theme}
      />
      <StatusRow
        label="Last Attempt"
        value={formatTimestamp(activity.lastAttemptAt)}
        theme={theme}
      />
      <StatusRow
        label="Last Result"
        value={getResultLabel(activity)}
        valueColor={getResultColor(activity, theme)}
        theme={theme}
      />
      <StatusRow
        label="Last Completed"
        value={formatTimestamp(activity.lastCompletedAt)}
        theme={theme}
      />
    </View>
  </View>
);
