import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Toast } from "@/components/shared/ui/molecules/toast";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { PopupCustomContentProps } from "@/types";
import {
  runLmsFeedbackAutofill,
  type FeedbackAutofillReport,
} from "@/services/feedback-autofill";
import { useAttendanceStore } from "@/stores/attendance-store";
import { useFeedbackAutofillStore } from "@/stores/feedback-autofill-store";

export function FeedbackAutofillPopupContent({
  popup,
  onClose,
}: PopupCustomContentProps) {
  const isDark = useColorScheme() === "dark";
  const theme = isDark ? Colors.dark : Colors.light;

  const attendanceCourses = useAttendanceStore((state) => state.courses);
  const courseDefaults = useFeedbackAutofillStore(
    (state) => state.courseDefaults,
  );
  const ensureCourseDefault = useFeedbackAutofillStore(
    (state) => state.ensureCourseDefault,
  );
  const setCourseDefault = useFeedbackAutofillStore(
    (state) => state.setCourseDefault,
  );

  const [isRunningAutofill, setIsRunningAutofill] = useState(false);
  const [liveProgress, setLiveProgress] = useState("");
  const [lastReport, setLastReport] = useState<FeedbackAutofillReport | null>(
    null,
  );
  const [gradePickerCourseId, setGradePickerCourseId] = useState<string | null>(
    null,
  );

  React.useEffect(() => {
    for (const course of attendanceCourses) {
      ensureCourseDefault(course.courseId);
    }
  }, [attendanceCourses, ensureCourseDefault]);

  const footerSummary = useMemo(() => {
    if (!lastReport) return "";
    return `${lastReport.formsSubmitted} submitted, ${lastReport.formsAttempted} attempted`;
  }, [lastReport]);

  const runAutofill = async () => {
    try {
      setIsRunningAutofill(true);
      setLiveProgress("Starting... This may take a bit for all courses.");
      Toast.show("Running in background. This may take a bit.", {
        type: "info",
      });

      const report = await runLmsFeedbackAutofill({
        defaultGrade: "3",
        defaultTextResponse: "_",
        submit: true,
        courseDefaults,
        parallelism: 4,
        onProgress: (progress) => {
          const message =
            progress.stage === "done"
              ? "Finalizing results..."
              : progress.courseTitle
                ? `Course ${progress.courseIndex}/${progress.totalCourses}: ${progress.courseTitle}`
                : `Processing ${progress.courseIndex}/${progress.totalCourses} courses...`;
          setLiveProgress(message);
        },
      });

      setLastReport(report);
      const baseMessage = `Done: ${report.formsSubmitted} submitted, ${report.formsAttempted} attempted (${report.feedbackFormsVisited} forms seen, ${report.formsSkippedNoQuestions} already done, ${report.formsSkippedNotAccessible} inaccessible).`;
      const extra =
        report.formsAttempted === 0
          ? ` Courses: ${report.coursesDiscovered}, feedback links: ${report.feedbackLinksDiscovered}.`
          : "";
      Toast.show(`${baseMessage}${extra}`, {
        type: report.errors.length > 0 ? "warning" : "success",
      });
      if (report.errors.length > 0) {
        Toast.show(`Autofill note: ${report.errors[0]}`, { type: "warning" });
      }
      onClose();
    } catch {
      Toast.show("Could not run feedback autofill", { type: "error" });
    } finally {
      setIsRunningAutofill(false);
    }
  };

  return (
    <View>
      <Text
        className="mb-4 text-[15px] leading-6"
        style={{ color: theme.textSecondary }}
      >
        {popup.description}
      </Text>

      <View className="mb-4 gap-2">
        <Text
          className="text-[12px] font-semibold"
          style={{ color: theme.textSecondary }}
        >
          Per-course defaults (grade 0-5 + text)
        </Text>

        <ScrollView
          className="max-h-[250px]"
          contentContainerStyle={{ paddingBottom: 4 }}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          onScrollBeginDrag={() => setGradePickerCourseId(null)}
        >
          {attendanceCourses.map((course) => {
            const pref = courseDefaults[course.courseId] ?? {
              grade: "3",
              textResponse: "_",
            };

            return (
              <View
                key={course.courseId}
                className="relative mt-2 gap-1"
                style={{
                  zIndex: gradePickerCourseId === course.courseId ? 30 : 1,
                }}
              >
                <Text
                  className="text-[12px] font-semibold"
                  style={{ color: theme.textSecondary }}
                  numberOfLines={1}
                >
                  {course.courseName}
                </Text>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() =>
                      setGradePickerCourseId((prev) =>
                        prev === course.courseId ? null : course.courseId,
                      )
                    }
                    className="w-[72px] flex-row items-center justify-center gap-1 rounded-xl border px-2 py-2.5"
                    style={{
                      borderColor: theme.border,
                      backgroundColor: theme.backgroundSecondary,
                    }}
                  >
                    <Text
                      className="text-[14px] font-semibold"
                      style={{ color: theme.text }}
                    >
                      {pref.grade || "3"}
                    </Text>
                    <Ionicons
                      name={
                        gradePickerCourseId === course.courseId
                          ? "chevron-up"
                          : "chevron-down"
                      }
                      size={14}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                  <TextInput
                    value={pref.textResponse}
                    onChangeText={(value) =>
                      setCourseDefault(
                        course.courseId,
                        pref.grade || "3",
                        value,
                      )
                    }
                    returnKeyType="done"
                    blurOnSubmit
                    className="flex-1 rounded-xl border px-3 py-2.5 text-[14px]"
                    style={{
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.backgroundSecondary,
                    }}
                  />
                </View>

                {gradePickerCourseId === course.courseId && (
                  <View
                    className="absolute left-0 top-[44px] w-[72px] rounded-xl border p-1"
                    style={{
                      borderColor: theme.border,
                      backgroundColor: theme.background,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.16,
                      shadowRadius: 12,
                      elevation: 12,
                    }}
                  >
                    {["5", "4", "3", "2", "1", "0"].map((value) => {
                      const selected = (pref.grade || "3") === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => {
                            setCourseDefault(
                              course.courseId,
                              value,
                              pref.textResponse,
                            );
                            setGradePickerCourseId(null);
                          }}
                          className="items-center rounded-md py-1.5"
                          style={{
                            backgroundColor: selected
                              ? Colors.accent
                              : "transparent",
                          }}
                        >
                          <Text
                            className="text-[13px] font-semibold"
                            style={{
                              color: selected ? Colors.white : theme.text,
                            }}
                          >
                            {value}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      {isRunningAutofill && (
        <View
          className="mb-4 rounded-xl border px-3 py-2.5"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.backgroundSecondary,
          }}
        >
          <Text className="text-[12px]" style={{ color: theme.textSecondary }}>
            {liveProgress || "Running in background..."}
          </Text>
        </View>
      )}

      {!isRunningAutofill && footerSummary.length > 0 && (
        <Text
          className="mb-3 text-[12px]"
          style={{ color: theme.textSecondary }}
        >
          Last run: {footerSummary}
        </Text>
      )}

      <View className="flex-row gap-2">
        <Pressable
          onPress={onClose}
          className="flex-1 items-center justify-center rounded-2xl py-3.5 active:opacity-70"
          style={{
            backgroundColor: isDark ? Colors.gray[800] : Colors.gray[100],
          }}
        >
          <Text
            className="text-[14px] font-semibold"
            style={{ color: theme.text, letterSpacing: 0.3 }}
          >
            Later
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void runAutofill();
          }}
          className="flex-1 items-center justify-center rounded-2xl py-3.5 active:opacity-70"
          style={{ backgroundColor: Colors.accent }}
          disabled={isRunningAutofill}
        >
          <Text
            className="text-[14px] font-semibold"
            style={{ color: Colors.white, letterSpacing: 0.3 }}
          >
            {isRunningAutofill ? "Running..." : popup.ctaLabel || "Run"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
