import { Linking, Pressable, Text, View } from "react-native";
import { Colors } from "@/constants/theme";

type SettingsFooterProps = {
  appVersion: string;
  buildVersion: string | null;
  showBuildVersion: boolean;
  theme: typeof Colors.light;
};

export const SettingsFooter = ({
  appVersion,
  buildVersion,
  showBuildVersion,
  theme,
}: SettingsFooterProps) => (
  <View className="mt-8 items-center gap-1">
    <Text className="text-xs" style={{ color: theme.textSecondary }}>
      {showBuildVersion && buildVersion
        ? `Bunkialo v${appVersion}(${buildVersion})`
        : `Bunkialo v${appVersion}`}
    </Text>
    <View className="flex-row items-center">
      <Text className="text-xs" style={{ color: theme.textSecondary }}>
        Made by{" "}
      </Text>
      <Pressable
        onPress={() =>
          Linking.openURL("https://www.linkedin.com/in/noel-georgi/")
        }
      >
        <Text className="text-xs underline" style={{ color: theme.textSecondary }}>
          Noel Georgi
        </Text>
      </Pressable>
    </View>
    <View className="flex-row items-center">
      <Text className="text-xs" style={{ color: theme.textSecondary }}>
        Ideas by{" "}
      </Text>
      <Pressable
        onPress={() =>
          Linking.openURL(
            "https://www.linkedin.com/in/srimoneyshankar-ajith-a5a6831ba/",
          )
        }
      >
        <Text className="text-xs underline" style={{ color: theme.textSecondary }}>
          Srimoney
        </Text>
      </Pressable>
      <Text className="text-xs" style={{ color: theme.textSecondary }}>
        {" "}
        &{" "}
      </Text>
      <Pressable
        onPress={() =>
          Linking.openURL("https://www.linkedin.com/in/niranjan-vasudevan/")
        }
      >
        <Text className="text-xs underline" style={{ color: theme.textSecondary }}>
          Niranjan V
        </Text>
      </Pressable>
    </View>
  </View>
);
