import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

type SettingRowProps = {
  danger?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  loading?: boolean;
  onPress?: () => void;
  rightElement?: ReactNode;
  theme: typeof Colors.light;
};

export const SettingRow = ({
  danger,
  icon,
  label,
  loading,
  onPress,
  rightElement,
  theme,
}: SettingRowProps) => (
  <Pressable
    className="flex-row items-center justify-between px-4 py-3"
    style={({ pressed }) => ({
      backgroundColor:
        pressed && onPress ? theme.backgroundSecondary : "transparent",
    })}
    onPress={onPress}
    disabled={loading || !onPress}
  >
    <View className="flex-row items-center gap-2">
      <Ionicons
        name={icon}
        size={20}
        color={danger ? Colors.status.danger : theme.textSecondary}
      />
      <Text
        className="text-[15px]"
        style={{ color: danger ? Colors.status.danger : theme.text }}
      >
        {label}
      </Text>
    </View>
    {loading ? (
      <ActivityIndicator size="small" color={theme.textSecondary} />
    ) : rightElement ? (
      rightElement
    ) : onPress ? (
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    ) : null}
  </Pressable>
);
