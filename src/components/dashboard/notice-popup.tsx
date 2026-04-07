import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { POPUP_NOTICES } from "@/data/popups";
import type { FeedbackAutofillReport } from "@/services/feedback-autofill";
import { runLmsFeedbackAutofill } from "@/services/feedback-autofill";
import { usePopupStore } from "@/stores/popup-store";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Toast } from "@/components/shared/ui/molecules/toast";
import type { PopupNotice } from "@/types";

export function NoticePopup() {
  const hasHydrated = usePopupStore((state) => state.hasHydrated);
  const seenPopupIds = usePopupStore((state) => state.seenPopupIds);
  const markAsSeen = usePopupStore((state) => state.markAsSeen);
  const storedDefaultGrade = usePopupStore(
    (state) => state.feedbackDefaultGrade,
  );
  const storedDefaultTextResponse = usePopupStore(
    (state) => state.feedbackDefaultTextResponse,
  );
  const setFeedbackAutofillDefaults = usePopupStore(
    (state) => state.setFeedbackAutofillDefaults,
  );

  const [currentPopup, setCurrentPopup] = useState<PopupNotice | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [gradeInput, setGradeInput] = useState(storedDefaultGrade);
  const [textResponseInput, setTextResponseInput] = useState(
    storedDefaultTextResponse,
  );
  const [isRunningAutofill, setIsRunningAutofill] = useState(false);
  const [liveProgress, setLiveProgress] = useState("");
  const [lastReport, setLastReport] = useState<FeedbackAutofillReport | null>(
    null,
  );

  const isDark = useColorScheme() === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, slideAnim]);

  const animateOut = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (currentPopup) markAsSeen(currentPopup.id);
      setModalVisible(false);
      setCurrentPopup(null);
    });
  }, [backdropOpacity, currentPopup, markAsSeen, slideAnim]);

  const handlePopupCta = useCallback(async () => {
    if (!currentPopup?.ctaAction) return;

    if (currentPopup.ctaAction === "run-lms-feedback-autofill") {
      try {
        const gradeValue = gradeInput.trim();
        const safeGrade = /^[0-5]$/.test(gradeValue) ? gradeValue : "3";
        const safeTextResponse = textResponseInput.trim() || "_";

        setFeedbackAutofillDefaults(safeGrade, safeTextResponse);

        setIsRunningAutofill(true);
        setLiveProgress("Starting... This may take a bit for all courses.");
        Toast.show("Running in background. This may take a bit.", {
          type: "info",
        });

        const report = await runLmsFeedbackAutofill({
          defaultGrade: safeGrade,
          defaultTextResponse: safeTextResponse,
          submit: true,
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

        const baseMessage = `Done: ${report.formsSubmitted} submitted, ${report.formsAttempted} attempted (${report.feedbackFormsVisited} forms seen, ${report.formsSkippedNoQuestions} already done).`;
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
      } catch {
        Toast.show("Could not run feedback autofill", { type: "error" });
      } finally {
        setIsRunningAutofill(false);
      }
    }

    animateOut();
  }, [
    animateOut,
    currentPopup,
    gradeInput,
    setFeedbackAutofillDefaults,
    textResponseInput,
  ]);

  useEffect(() => {
    if (!hasHydrated || modalVisible) return;

    const unseen = POPUP_NOTICES.filter(
      (popup) => !seenPopupIds.includes(popup.id),
    );
    if (unseen.length === 0) return;

    const sorted = [...unseen].sort((a, b) => {
      if (a.isImportant && !b.isImportant) return -1;
      if (!a.isImportant && b.isImportant) return 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    backdropOpacity.setValue(0);
    slideAnim.setValue(300);
    setCurrentPopup(sorted[0]);
    setModalVisible(true);
  }, [hasHydrated, modalVisible, seenPopupIds, backdropOpacity, slideAnim]);

  useEffect(() => {
    if (modalVisible && currentPopup) animateIn();
  }, [animateIn, currentPopup, modalVisible]);

  useEffect(() => {
    if (!modalVisible || !currentPopup?.ctaAction) return;
    setGradeInput(storedDefaultGrade);
    setTextResponseInput(storedDefaultTextResponse);
  }, [
    currentPopup?.ctaAction,
    modalVisible,
    storedDefaultGrade,
    storedDefaultTextResponse,
  ]);

  const ctaHidden = isRunningAutofill;
  const footerSummary = useMemo(() => {
    if (!lastReport) return "";
    return `${lastReport.formsSubmitted} submitted, ${lastReport.formsAttempted} attempted`;
  }, [lastReport]);

  if (!hasHydrated || !currentPopup || !modalVisible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={insets.bottom + 16}
      >
        <View className="flex-1 justify-end">
          <Animated.View
            className="absolute inset-0"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              opacity: backdropOpacity,
            }}
          >
            <Pressable className="flex-1" onPress={animateOut} />
          </Animated.View>

          <Animated.View
            className="mx-4 mb-4 rounded-3xl p-6"
            style={{
              transform: [{ translateY: slideAnim }],
              backgroundColor: theme.background,
              paddingBottom: Math.max(24, insets.bottom + 16),
              borderWidth: 1,
              borderColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 12,
            }}
          >
            <View className="mb-4 flex-row items-center gap-3">
              <View
                className="h-11 w-11 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: currentPopup.iconColor
                    ? `${currentPopup.iconColor}18`
                    : `${Colors.accent}18`,
                }}
              >
                <Ionicons
                  name={currentPopup.icon || "notifications"}
                  size={22}
                  color={currentPopup.iconColor || Colors.accent}
                />
              </View>
              <Text
                className="flex-1 text-[17px] font-bold tracking-tight"
                style={{ color: theme.text }}
                numberOfLines={2}
              >
                {currentPopup.title}
              </Text>
            </View>

            <Text
              className="mb-6 text-[15px] leading-6"
              style={{ color: theme.textSecondary }}
            >
              {currentPopup.description}
            </Text>

            {currentPopup.ctaAction === "run-lms-feedback-autofill" && (
              <View className="mb-4 gap-2">
                <Text
                  className="text-[12px] font-semibold"
                  style={{ color: theme.textSecondary }}
                >
                  Default grade (0-5)
                </Text>
                <TextInput
                  value={gradeInput}
                  onChangeText={setGradeInput}
                  placeholder="3"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  maxLength={1}
                  returnKeyType="done"
                  className="rounded-xl border px-3 py-2.5 text-[14px]"
                  style={{
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.backgroundSecondary,
                  }}
                />

                <Text
                  className="text-[12px] font-semibold"
                  style={{ color: theme.textSecondary }}
                >
                  Default text response
                </Text>
                <TextInput
                  value={textResponseInput}
                  onChangeText={setTextResponseInput}
                  placeholder="_"
                  placeholderTextColor={theme.textSecondary}
                  returnKeyType="done"
                  className="rounded-xl border px-3 py-2.5 text-[14px]"
                  style={{
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.backgroundSecondary,
                  }}
                />
              </View>
            )}

            {isRunningAutofill && (
              <View
                className="mb-4 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: theme.border,
                  backgroundColor: theme.backgroundSecondary,
                }}
              >
                <Text
                  className="text-[12px]"
                  style={{ color: theme.textSecondary }}
                >
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

            {!ctaHidden && currentPopup.ctaLabel && currentPopup.ctaAction ? (
              <View className="flex-row gap-2">
                <Pressable
                  onPress={animateOut}
                  className="flex-1 items-center justify-center rounded-2xl py-3.5 active:opacity-70"
                  style={{
                    backgroundColor: isDark
                      ? Colors.gray[800]
                      : Colors.gray[100],
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
                    void handlePopupCta();
                  }}
                  className="flex-1 items-center justify-center rounded-2xl py-3.5 active:opacity-70"
                  style={{ backgroundColor: Colors.accent }}
                  disabled={isRunningAutofill}
                >
                  <Text
                    className="text-[14px] font-semibold"
                    style={{ color: Colors.white, letterSpacing: 0.3 }}
                  >
                    {isRunningAutofill ? "Running..." : "Run Autofill"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={animateOut}
                className="items-center justify-center rounded-2xl py-3.5 active:opacity-70"
                style={{
                  backgroundColor: isDark ? Colors.gray[800] : Colors.gray[100],
                }}
              >
                <Text
                  className="text-[14px] font-semibold"
                  style={{ color: theme.text, letterSpacing: 0.3 }}
                >
                  Got it
                </Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      </KeyboardAwareScrollView>
    </Modal>
  );
}
