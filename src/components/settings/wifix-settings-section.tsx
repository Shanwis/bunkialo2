import { Colors } from "@/constants/theme";
import { Switch, Text, View } from "react-native";
import { SettingRow } from "./setting-row";

type WifixSettingsSectionProps = {
  autoReconnectEnabled: boolean;
  backgroundIntervalMinutes: number;
  onPressBackgroundInterval: () => void;
  onToggleAutoReconnect: (enabled: boolean) => void;
  theme: typeof Colors.light;
};

export const WifixSettingsSection = ({
  autoReconnectEnabled,
  backgroundIntervalMinutes,
  onPressBackgroundInterval,
  onToggleAutoReconnect,
  theme,
}: WifixSettingsSectionProps) => (
  <>
    <Text
      className="mt-6 mb-2 ml-1 text-xs font-semibold uppercase"
      style={{ color: theme.textSecondary }}
    >
      WiFix
    </Text>
    <View
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: theme.border }}
    >
      <SettingRow
        icon="wifi"
        label="Auto Reconnect"
        theme={theme}
        rightElement={
          <Switch
            value={autoReconnectEnabled}
            onValueChange={onToggleAutoReconnect}
            trackColor={{
              false: theme.border,
              true: Colors.status.info,
            }}
            thumbColor={Colors.white}
          />
        }
      />
      <View
        className="h-px"
        style={{ marginLeft: 48, backgroundColor: theme.border }}
      />
      <SettingRow
        icon="time-outline"
        label={`Background login: ${backgroundIntervalMinutes} min`}
        onPress={onPressBackgroundInterval}
        theme={theme}
      />
    </View>
  </>
);
