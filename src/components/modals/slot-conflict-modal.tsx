import { Button } from "@/components/ui/button";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { formatTimeDisplay, getDayName } from "@/stores/timetable-store";
import type {
  OutlierSlotConflict,
  SlotConflict,
  SlotOccurrenceStats,
  TimeOverlapSlotConflict,
} from "@/types";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  LayoutAnimation,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

type Tab = "clashes" | "outliers";

interface SlotConflictModalProps {
  visible: boolean;
  conflicts: SlotConflict[];
  onResolve: (
    conflictIndex: number,
    keep: "preferred" | "alternative" | "keep-outlier" | "ignore-outlier",
  ) => void;
  onResolveAllPreferred: () => void;
  onRevertConflict: (conflictId: string) => void;
  onClose: () => void;
}

const formatStats = (occurrence: number, total: number): string =>
  `${occurrence}/${Math.max(total, 1)}`;

const getTotalWeeks = (stats: SlotOccurrenceStats): number =>
  Math.max(stats.totalWeekSpanCount ?? stats.dayActiveWeekCount, 1);

const getFrequencyPercent = (stats: SlotOccurrenceStats): number => {
  const total = getTotalWeeks(stats);
  return Math.round((stats.occurrenceCount / total) * 100);
};

export function SlotConflictModal({
  visible,
  conflicts,
  onResolve,
  onResolveAllPreferred,
  onRevertConflict,
  onClose,
}: SlotConflictModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;

  const timeClashes = conflicts.filter(
    (c): c is TimeOverlapSlotConflict => c.type === "time-overlap",
  );
  const outliers = conflicts.filter(
    (c): c is OutlierSlotConflict => c.type === "outlier-review",
  );

  const [activeTab, setActiveTab] = useState<Tab>("clashes");
  const [selectionOverrides, setSelectionOverrides] = useState<
    Record<string, "preferred" | "alternative" | "keep" | "ignore" | null>
  >({});
  const [showAutoSaved, setShowAutoSaved] = useState(false);
  const [autoSavedTick, setAutoSavedTick] = useState(0);

  // default to whichever tab has items
  useEffect(() => {
    if (!visible) return;
    if (timeClashes.length === 0 && outliers.length > 0) {
      setActiveTab("outliers");
    } else {
      setActiveTab("clashes");
    }
  }, [visible, timeClashes.length, outliers.length]);

  useEffect(() => {
    if (!visible) return;
    const next: typeof selectionOverrides = {};
    for (const conflict of conflicts) {
      next[conflict.conflictId] = conflict.resolvedChoice;
    }
    setSelectionOverrides(next);
    setShowAutoSaved(false);
  }, [visible, conflicts]);

  useEffect(() => {
    if (!showAutoSaved) return;
    const timer = setTimeout(() => setShowAutoSaved(false), 1200);
    return () => clearTimeout(timer);
  }, [showAutoSaved, autoSavedTick]);

  const triggerAutoSaved = () => {
    setAutoSavedTick((p) => p + 1);
    setShowAutoSaved(true);
  };

  const getCurrentSelection = (
    conflictId: string,
    resolvedChoice: "preferred" | "alternative" | "keep" | "ignore" | null,
  ) => {
    if (conflictId in selectionOverrides) {
      return selectionOverrides[conflictId] ?? null;
    }
    return resolvedChoice;
  };

  const chooseTimeClash = (
    conflictIndex: number,
    conflictId: string,
    resolvedChoice: "preferred" | "alternative" | null,
    keep: "preferred" | "alternative",
  ) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const current = getCurrentSelection(conflictId, resolvedChoice);
    Haptics.selectionAsync();
    if (current === keep) {
      onRevertConflict(conflictId);
      setSelectionOverrides((prev) => ({ ...prev, [conflictId]: null }));
    } else {
      onResolve(conflictIndex, keep);
      setSelectionOverrides((prev) => ({ ...prev, [conflictId]: keep }));
    }
    triggerAutoSaved();
  };

  const chooseOutlier = (
    conflictIndex: number,
    conflictId: string,
    resolvedChoice: "keep" | "ignore" | null,
    keep: "keep-outlier" | "ignore-outlier",
  ) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const current = getCurrentSelection(conflictId, resolvedChoice);
    const isSame =
      (current === "keep" && keep === "keep-outlier") ||
      (current === "ignore" && keep === "ignore-outlier");
    Haptics.selectionAsync();
    if (isSame) {
      onRevertConflict(conflictId);
    } else {
      onResolve(conflictIndex, keep);
    }
    triggerAutoSaved();
  };

  const keepAllPreferredAndClose = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onResolveAllPreferred();
    onClose();
  };

  const unresolvedCount = conflicts.filter(
    (c) => c.resolvedChoice === null,
  ).length;

  const activeConflicts = activeTab === "clashes" ? timeClashes : outliers;
  const globalConflictOffset = activeTab === "clashes" ? 0 : timeClashes.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center">
        <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />
        <View
          className="w-[92%] max-w-[400px] max-h-[84%] rounded-2xl p-4"
          style={{ backgroundColor: theme.background }}
        >
          {/* header */}
          <View className="mb-2 flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center gap-2">
              <View
                className="h-[30px] w-[30px] items-center justify-center rounded-full"
                style={{ backgroundColor: Colors.status.warning + "24" }}
              >
                <Ionicons
                  name="warning"
                  size={16}
                  color={Colors.status.warning}
                />
              </View>
              <View>
                <Text
                  className="text-base font-semibold"
                  style={{ color: theme.text }}
                >
                  Slot Decisions
                </Text>
                <Text
                  className="text-[11px]"
                  style={{ color: theme.textSecondary }}
                >
                  {unresolvedCount} pending
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          {/* auto-saved indicator */}
          <View className="mb-2 h-4">
            {showAutoSaved && (
              <View className="flex-row items-center gap-1">
                <Ionicons
                  name="checkmark-done"
                  size={11}
                  color={Colors.status.success}
                />
                <Text
                  className="text-[10px] font-medium"
                  style={{ color: Colors.status.success }}
                >
                  Auto-saved just now
                </Text>
              </View>
            )}
          </View>

          {/* tabs */}
          <View
            className="mb-3 flex-row rounded-lg overflow-hidden"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            <Pressable
              onPress={() => setActiveTab("clashes")}
              className="flex-1 flex-row items-center justify-center gap-1.5 py-2"
              style={
                activeTab === "clashes"
                  ? { backgroundColor: theme.border }
                  : undefined
              }
            >
              <Ionicons
                name="time-outline"
                size={13}
                color={
                  activeTab === "clashes" ? theme.text : theme.textSecondary
                }
              />
              <Text
                className="text-[12px] font-semibold"
                style={{
                  color:
                    activeTab === "clashes" ? theme.text : theme.textSecondary,
                }}
              >
                Time Clashes
              </Text>
              {timeClashes.length > 0 && (
                <View
                  className="h-[16px] min-w-[16px] items-center justify-center rounded-full px-1"
                  style={{
                    backgroundColor: timeClashes.some(
                      (c) => c.resolvedChoice === null,
                    )
                      ? Colors.status.danger
                      : theme.border,
                  }}
                >
                  <Text
                    className="text-[9px] font-bold"
                    style={{ color: Colors.white }}
                  >
                    {timeClashes.length}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => setActiveTab("outliers")}
              className="flex-1 flex-row items-center justify-center gap-1.5 py-2"
              style={
                activeTab === "outliers"
                  ? { backgroundColor: theme.border }
                  : undefined
              }
            >
              <Ionicons
                name="flag-outline"
                size={13}
                color={
                  activeTab === "outliers" ? theme.text : theme.textSecondary
                }
              />
              <Text
                className="text-[12px] font-semibold"
                style={{
                  color:
                    activeTab === "outliers" ? theme.text : theme.textSecondary,
                }}
              >
                Outliers
              </Text>
              {outliers.length > 0 && (
                <View
                  className="h-[16px] min-w-[16px] items-center justify-center rounded-full px-1"
                  style={{
                    backgroundColor: outliers.some(
                      (c) => c.resolvedChoice === null,
                    )
                      ? Colors.status.warning
                      : theme.border,
                  }}
                >
                  <Text
                    className="text-[9px] font-bold"
                    style={{ color: Colors.white }}
                  >
                    {outliers.length}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* list */}
          <ScrollView
            className="flex-grow-0"
            contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
          >
            {activeConflicts.length === 0 && (
              <View className="items-center py-6">
                <Ionicons
                  name={
                    activeTab === "clashes"
                      ? "checkmark-circle-outline"
                      : "flag-outline"
                  }
                  size={32}
                  color={theme.textSecondary}
                />
                <Text
                  className="mt-2 text-[12px]"
                  style={{ color: theme.textSecondary }}
                >
                  {activeTab === "clashes"
                    ? "No time clashes"
                    : "No outliers detected"}
                </Text>
              </View>
            )}
            {activeConflicts.map((conflict, localIndex) => {
              const globalIndex = localIndex + globalConflictOffset;
              const isResolved = conflict.resolvedChoice !== null;

              if (conflict.type === "time-overlap") {
                const currentSelection = getCurrentSelection(
                  conflict.conflictId,
                  conflict.resolvedChoice,
                );
                const isPreferred = currentSelection === "preferred";
                const isAlternative = currentSelection === "alternative";

                return (
                  <View
                    key={conflict.conflictId}
                    className="rounded-xl p-2.5"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      opacity: isResolved ? 0.68 : 1,
                    }}
                  >
                    {/* card title */}
                    <View className="mb-2 flex-row items-center gap-2">
                      <View
                        className="h-5 w-5 items-center justify-center rounded-full"
                        style={{ backgroundColor: theme.border }}
                      >
                        <Text
                          className="text-[10px] font-bold"
                          style={{ color: theme.text }}
                        >
                          {localIndex + 1}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-[13px] font-semibold"
                          style={{ color: theme.text }}
                        >
                          Time Clash
                        </Text>
                        <Text
                          className="text-[10px]"
                          style={{ color: theme.textSecondary }}
                        >
                          {getDayName(conflict.preferredSlot.dayOfWeek, false)}
                        </Text>
                      </View>
                    </View>

                    {/* two slot cards */}
                    <View className="flex-row items-stretch gap-1.5">
                      <Pressable
                        onPress={() =>
                          chooseTimeClash(
                            globalIndex,
                            conflict.conflictId,
                            conflict.resolvedChoice,
                            "preferred",
                          )
                        }
                        className="flex-1 rounded-lg border px-2 py-2"
                        style={{
                          borderColor: Colors.status.success + "70",
                          backgroundColor: isPreferred
                            ? Colors.status.success + "1F"
                            : Colors.status.success + "12",
                        }}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text
                            className="text-[10px] font-bold"
                            style={{ color: Colors.status.success }}
                          >
                            Preferred
                          </Text>
                          {isPreferred && (
                            <Ionicons
                              name="checkmark-circle"
                              size={14}
                              color={Colors.status.success}
                            />
                          )}
                        </View>
                        <Text
                          className="text-[10px] font-semibold"
                          numberOfLines={1}
                          style={{ color: theme.text }}
                        >
                          {conflict.preferredSlot.courseName}
                        </Text>
                        <Text
                          className="text-[9px]"
                          numberOfLines={1}
                          style={{ color: theme.textSecondary }}
                        >
                          {formatTimeDisplay(conflict.preferredSlot.startTime)}
                          {" - "}
                          {formatTimeDisplay(conflict.preferredSlot.endTime)}
                        </Text>
                        {conflict.preferredStats && (
                          <Text
                            className="text-[9px]"
                            style={{ color: theme.textSecondary }}
                          >
                            {formatStats(
                              conflict.preferredStats.occurrenceCount,
                              getTotalWeeks(conflict.preferredStats),
                            )}
                            {" weeks"}
                            {" · "}
                            {getFrequencyPercent(conflict.preferredStats)}%
                          </Text>
                        )}
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          chooseTimeClash(
                            globalIndex,
                            conflict.conflictId,
                            conflict.resolvedChoice,
                            "alternative",
                          )
                        }
                        className="flex-1 rounded-lg border px-2 py-2"
                        style={{
                          borderColor: Colors.status.warning + "70",
                          backgroundColor: isAlternative
                            ? Colors.status.warning + "1F"
                            : Colors.status.warning + "12",
                        }}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text
                            className="text-[10px] font-bold"
                            style={{ color: Colors.status.warning }}
                          >
                            Alternative
                          </Text>
                          {isAlternative && (
                            <Ionicons
                              name="checkmark-circle"
                              size={14}
                              color={Colors.status.warning}
                            />
                          )}
                        </View>
                        <Text
                          className="text-[10px] font-semibold"
                          numberOfLines={1}
                          style={{ color: theme.text }}
                        >
                          {conflict.alternativeSlot.courseName}
                        </Text>
                        <Text
                          className="text-[9px]"
                          numberOfLines={1}
                          style={{ color: theme.textSecondary }}
                        >
                          {formatTimeDisplay(
                            conflict.alternativeSlot.startTime,
                          )}
                          {" - "}
                          {formatTimeDisplay(conflict.alternativeSlot.endTime)}
                        </Text>
                        {conflict.alternativeStats && (
                          <Text
                            className="text-[9px]"
                            style={{ color: theme.textSecondary }}
                          >
                            {formatStats(
                              conflict.alternativeStats.occurrenceCount,
                              getTotalWeeks(conflict.alternativeStats),
                            )}
                            {" weeks"}
                            {" · "}
                            {getFrequencyPercent(conflict.alternativeStats)}%
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                );
              }

              // outlier-review
              return (
                <View
                  key={conflict.conflictId}
                  className="rounded-xl p-2.5"
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    opacity: isResolved ? 0.68 : 1,
                  }}
                >
                  <View
                    className="rounded-lg border px-2 py-2"
                    style={{
                      borderColor: Colors.status.warning + "70",
                      backgroundColor: Colors.status.warning + "12",
                    }}
                  >
                    <View className="mb-1 flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text
                          className="text-[10px] font-semibold"
                          numberOfLines={1}
                          style={{ color: theme.text }}
                        >
                          {conflict.slot.courseName}
                        </Text>
                        <Text
                          className="text-[9px]"
                          style={{ color: theme.textSecondary }}
                        >
                          {getDayName(conflict.slot.dayOfWeek, false)}
                          {" · "}
                          {formatTimeDisplay(conflict.slot.startTime)}
                          {" - "}
                          {formatTimeDisplay(conflict.slot.endTime)}
                        </Text>
                        <Text
                          className="text-[9px] mt-0.5"
                          style={{ color: Colors.status.warning }}
                        >
                          {formatStats(
                            conflict.stats.occurrenceCount,
                            getTotalWeeks(conflict.stats),
                          )}
                          {" weeks"}
                          {" · "}
                          {getFrequencyPercent(conflict.stats)}% frequency
                        </Text>
                      </View>
                      <View className="flex-row gap-1">
                        <Pressable
                          onPress={() =>
                            chooseOutlier(
                              globalIndex,
                              conflict.conflictId,
                              conflict.resolvedChoice,
                              "keep-outlier",
                            )
                          }
                          className="h-6 w-6 items-center justify-center rounded-md border"
                          style={{
                            borderColor:
                              conflict.resolvedChoice === "keep"
                                ? Colors.status.success
                                : theme.border,
                            backgroundColor:
                              conflict.resolvedChoice === "keep"
                                ? Colors.status.success + "22"
                                : theme.background,
                          }}
                        >
                          <Ionicons
                            name="checkmark"
                            size={13}
                            color={
                              conflict.resolvedChoice === "keep"
                                ? Colors.status.success
                                : theme.textSecondary
                            }
                          />
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            chooseOutlier(
                              globalIndex,
                              conflict.conflictId,
                              conflict.resolvedChoice,
                              "ignore-outlier",
                            )
                          }
                          className="h-6 w-6 items-center justify-center rounded-md border"
                          style={{
                            borderColor:
                              conflict.resolvedChoice === "ignore"
                                ? Colors.status.danger
                                : theme.border,
                            backgroundColor:
                              conflict.resolvedChoice === "ignore"
                                ? Colors.status.danger + "1E"
                                : theme.background,
                          }}
                        >
                          <Ionicons
                            name="close"
                            size={13}
                            color={
                              conflict.resolvedChoice === "ignore"
                                ? Colors.status.danger
                                : theme.textSecondary
                            }
                          />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* footer */}
          <View className="mt-2 gap-1.5">
            {activeTab === "clashes" && timeClashes.length > 0 && (
              <Button
                title="Keep All Preferred & Close"
                variant="primary"
                onPress={keepAllPreferredAndClose}
                style={{ flex: 1 }}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
