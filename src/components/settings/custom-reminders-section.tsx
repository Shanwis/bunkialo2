import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, TextInput, View } from "react-native";

type CustomRemindersSectionProps = {
  newReminder: string;
  onAddReminder: () => void;
  onChangeNewReminder: (value: string) => void;
  onRemoveReminder: (minutes: number) => void;
  reminders: number[];
  theme: typeof Colors.light;
};

export const CustomRemindersSection = ({
  newReminder,
  onAddReminder,
  onChangeNewReminder,
  onRemoveReminder,
  reminders,
  theme,
}: CustomRemindersSectionProps) => (
  <>
    <Text
      className="mt-6 mb-2 ml-1 text-xs font-semibold uppercase"
      style={{ color: theme.textSecondary }}
    >
      Custom Reminders
    </Text>
    <View
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: theme.border }}
    >
      {reminders.map((minutes) => (
        <View
          key={minutes}
          className="flex-row items-center justify-between px-4 py-2"
        >
          <Text className="text-sm" style={{ color: theme.text }}>
            {minutes} min before
          </Text>
          <Pressable onPress={() => onRemoveReminder(minutes)}>
            <Ionicons
              name="close-circle"
              size={20}
              color={Colors.status.danger}
            />
          </Pressable>
        </View>
      ))}
      <View className="flex-row items-center gap-2 p-4">
        <TextInput
          className="h-10 flex-1 rounded-lg border px-2 text-sm"
          style={{ color: theme.text, borderColor: theme.border }}
          placeholder="mins"
          placeholderTextColor={theme.textSecondary}
          value={newReminder}
          onChangeText={onChangeNewReminder}
          keyboardType="numeric"
        />
        <Pressable
          className="h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: Colors.status.info }}
          onPress={onAddReminder}
        >
          <Ionicons name="add" size={20} color={Colors.white} />
        </Pressable>
      </View>
    </View>
  </>
);
