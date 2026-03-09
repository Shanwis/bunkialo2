import { Button } from "@/components/ui/button";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { formatTimeDisplay, getDayName } from "@/stores/timetable-store";
import type {
  DayOfWeek,
  OutlierSlotConflict,
  SlotConflict,
  SlotOccurrenceStats,
  TimeOverlapSlotConflict,
} from "@/types";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutAnimation,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

type Tab = "clashes" | "outliers";
type DayFilter = "all" | DayOfWeek;

const DAY_LABELS: { key: DayFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: 1, label: "Mon" },
  { key: 2, label: "Tue" },
  { key: 3, label: "Wed" },
  { key: 4, label: "Thu" },
  { key: 5, label: "Fri" },
  { key: 6, label: "Sat" },
];

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

  const [activeTab, setActiveTab] = useState<Tab>("outliers");
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [selectionOverrides, setSelectionOverrides] = useState<
    Record<string, "preferred" | "alternative" | "keep" | "ignore" | null>
  >({});
  const [showAutoSaved, setShowAutoSaved] = useState(false);
  const [autoSavedTick, setAutoSavedTick] = useState(0);

  const clashCountByDay = useMemo(() => {
    const counts = new Map<DayOfWeek, number>();
    for (const clash of timeClashes) {
      const day = clash.preferredSlot.dayOfWeek;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [timeClashes]);

  const daysWithClashes = useMemo(
    () =>
      DAY_LABELS.filter(
        (d) => d.key === "all" || clashCountByDay.has(d.key as DayOfWeek),
      ),
    [clashCountByDay],
  );

  const filteredTimeClashes = useMemo(
    () =>
      dayFilter === "all"
        ? timeClashes
        : timeClashes.filter((c) => c.preferredSlot.dayOfWeek === dayFilter),
    [timeClashes, dayFilter],
  );

  const groupedClashes = useMemo(() => {
    const groups = new Map<DayOfWeek, TimeOverlapSlotConflict[]>();
    for (const clash of filteredTimeClashes) {
      const day = clash.preferredSlot.dayOfWeek;
      const existing = groups.get(day) ?? [];
      existing.push(clash);
      groups.set(day, existing);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [filteredTimeClashes]);

  useEffect(() => {
    if (!visible) return;
    setActiveTab(
      outliers.length > 0 ? "outliers" : "clashes",
    );
    setDayFilter("all");
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
  ) => selectionOverrides[conflictId] ?? resolvedChoice;

  const chooseTimeClash = (
    conflictIndex: number,
    conflictId: string,
    resolvedChoice: "preferred" | "alternative" | null,
    keep: "preferred" | "alternative",
  ) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.selectionAsync();
    if (getCurrentSelection(conflictId, resolvedChoice) === keep) {
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
    Haptics.selectionAsync();
    const current = getCurrentSelection(conflictId, resolvedChoice);
    const isSame =
      (current === "keep" && keep === "keep-outlier") ||
      (current === "ignore" && keep === "ignore-outlier");
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
  const getGlobalIndex = (conflict: SlotConflict) =>
    conflicts.indexOf(conflict);

  let clashNumber = 0;

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
          className="w-[92%] max-w-[400px] max-h-[84%] rounded-2xl px-3 pt-3 pb-3"
          style={{ backgroundColor: theme.background }}
        >
          {/* header */}
          <View className="mb-2 flex-row items-center justify-between px-1">
            <View className="flex-1 flex-row items-center gap-2">
              <View
                className="h-7 w-7 items-center justify-center rounded-full"
                style={{ backgroundColor: Colors.status.warning + "24" }}
              >
                <Ionicons
                  name="warning"
                  size={14}
                  color={Colors.status.warning}
                />
              </View>
              <View>
                <Text
                  className="text-[15px] font-semibold"
                  style={{ color: theme.text }}
                >
                  Slot Decisions
                </Text>
                {showAutoSaved ? (
                  <View className="flex-row items-center gap-0.5">
                    <Ionicons
                      name="checkmark-done"
                      size={10}
                      color={Colors.status.success}
                    />
                    <Text
                      className="text-[10px] font-medium"
                      style={{ color: Colors.status.success }}
                    >
                      Saved
                    </Text>
                  </View>
                ) : (
                  <Text
                    className="text-[10px]"
                    style={{ color: theme.textSecondary }}
                  >
                    {unresolvedCount > 0
                      ? `${unresolvedCount} pending`
                      : "All resolved"}
                  </Text>
                )}
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          {/* tabs */}
          <View
            className="mt-1 mb-2 flex-row rounded-lg overflow-hidden"
            style={{ backgroundColor: theme.backgroundSecondary }}
          >
            {[
              {
                key: "outliers" as Tab,
                icon: "flag-outline" as const,
                label: "Outliers",
                count: outliers.length,
                hasUnresolved: outliers.some((c) => c.resolvedChoice === null),
              },
              {
                key: "clashes" as Tab,
                icon: "time-outline" as const,
                label: "Time Clashes",
                count: timeClashes.length,
                hasUnresolved: timeClashes.some(
                  (c) => c.resolvedChoice === null,
                ),
              },
            ].map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => {
                  setActiveTab(tab.key);
                  if (tab.key === "clashes") setDayFilter("all");
                }}
                className="flex-1 flex-row items-center justify-center gap-1 py-1.5"
                style={
                  activeTab === tab.key
                    ? { backgroundColor: theme.border }
                    : undefined
                }
              >
                <Ionicons
                  name={tab.icon}
                  size={12}
                  color={
                    activeTab === tab.key ? theme.text : theme.textSecondary
                  }
                />
                <Text
                  className="text-[11px] font-semibold"
                  style={{
                    color:
                      activeTab === tab.key ? theme.text : theme.textSecondary,
                  }}
                >
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View
                    className="h-[14px] min-w-[14px] items-center justify-center rounded-full px-0.5"
                    style={{
                      backgroundColor: tab.hasUnresolved
                        ? Colors.status.danger
                        : theme.border,
                    }}
                  >
                    <Text
                      className="text-[8px] font-bold"
                      style={{ color: Colors.white }}
                    >
                      {tab.count}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          {/* day filter pills — centred */}
          {activeTab === "clashes" && daysWithClashes.length > 1 && (
            <View className="mb-2 flex-row flex-wrap items-center justify-center gap-1">
              {daysWithClashes.map(({ key, label }) => {
                const isSelected = dayFilter === key;
                const count =
                  key === "all"
                    ? timeClashes.length
                    : (clashCountByDay.get(key as DayOfWeek) ?? 0);
                return (
                  <Pressable
                    key={String(key)}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setDayFilter(key);
                    }}
                    className="flex-row items-center gap-1 rounded-lg px-2 py-1"
                    style={{
                      backgroundColor: isSelected
                        ? theme.text
                        : theme.backgroundSecondary,
                    }}
                  >
                    <Text
                      className="text-[10px] font-semibold"
                      style={{
                        color: isSelected
                          ? theme.background
                          : theme.textSecondary,
                      }}
                    >
                      {label}
                    </Text>
                    <View
                      className="h-[12px] min-w-[12px] items-center justify-center rounded-full px-0.5"
                      style={{
                        backgroundColor: isSelected
                          ? theme.background + "30"
                          : theme.border,
                      }}
                    >
                      <Text
                        className="text-[7px] font-bold"
                        style={{
                          color: isSelected
                            ? theme.background
                            : theme.textSecondary,
                        }}
                      >
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* content */}
          <ScrollView
            className="flex-grow-0"
            contentContainerStyle={{ paddingBottom: 2 }}
          >
            {activeTab === "clashes" && (
              <>
                {filteredTimeClashes.length === 0 && (
                  <View className="items-center py-6">
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={28}
                      color={theme.textSecondary}
                    />
                    <Text
                      className="mt-1.5 text-[11px]"
                      style={{ color: theme.textSecondary }}
                    >
                      {dayFilter === "all"
                        ? "No time clashes"
                        : `No clashes on ${getDayName(dayFilter as DayOfWeek, false)}`}
                    </Text>
                  </View>
                )}

                {groupedClashes.map(([day, clashes], groupIdx) => (
                  <View key={day} style={{ marginTop: groupIdx > 0 ? 10 : 0 }}>
                    {/* day section header */}
                    {dayFilter === "all" && (
                      <View className="flex-row items-center gap-1.5 mb-1.5">
                        <Text
                          className="text-[10px] font-semibold"
                          style={{ color: theme.textSecondary }}
                        >
                          {getDayName(day, false)}
                        </Text>
                        <View
                          className="flex-1 h-px"
                          style={{ backgroundColor: theme.border + "60" }}
                        />
                      </View>
                    )}

                    {clashes.map((conflict, idx) => {
                      clashNumber += 1;
                      const num = clashNumber;
                      const globalIndex = getGlobalIndex(conflict);
                      const sel = getCurrentSelection(
                        conflict.conflictId,
                        conflict.resolvedChoice,
                      );
                      const isPreferred = sel === "preferred";
                      const isAlternative = sel === "alternative";
                      const isResolved = conflict.resolvedChoice !== null;

                      return (
                        <View
                          key={conflict.conflictId}
                          className="flex-row items-start"
                          style={{
                            marginTop: idx > 0 ? 6 : 0,
                            opacity: isResolved ? 0.6 : 1,
                          }}
                        >
                          {/* plain number */}
                          <Text
                            className="w-5 mt-1 text-[11px] font-bold"
                            style={{ color: theme.textSecondary }}
                          >
                            {num}
                          </Text>

                          {/* slot pair */}
                          <View className="flex-1 flex-row gap-1.5">
                            <Pressable
                              onPress={() =>
                                chooseTimeClash(
                                  globalIndex,
                                  conflict.conflictId,
                                  conflict.resolvedChoice,
                                  "preferred",
                                )
                              }
                              className="flex-1 rounded-lg border px-2 py-1.5"
                              style={{
                                borderColor: isPreferred
                                  ? Colors.status.success + "90"
                                  : theme.border + "80",
                                backgroundColor: isPreferred
                                  ? Colors.status.success + "18"
                                  : "transparent",
                              }}
                            >
                              <View className="flex-row items-center justify-between mb-0.5">
                                <Text
                                  className="text-[8px] font-bold tracking-wider uppercase"
                                  style={{ color: Colors.status.success }}
                                >
                                  Preferred
                                </Text>
                                {isPreferred && (
                                  <Ionicons
                                    name="checkmark-circle"
                                    size={12}
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
                                className="text-[8px] mt-0.5"
                                style={{ color: theme.textSecondary }}
                              >
                                {formatTimeDisplay(
                                  conflict.preferredSlot.startTime,
                                )}{" "}
                                -{" "}
                                {formatTimeDisplay(
                                  conflict.preferredSlot.endTime,
                                )}
                              </Text>
                              {conflict.preferredStats && (
                                <Text
                                  className="text-[8px]"
                                  style={{ color: theme.textSecondary }}
                                >
                                  {formatStats(
                                    conflict.preferredStats.occurrenceCount,
                                    getTotalWeeks(conflict.preferredStats),
                                  )}{" "}
                                  wks ·{" "}
                                  {getFrequencyPercent(conflict.preferredStats)}
                                  %
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
                              className="flex-1 rounded-lg border px-2 py-1.5"
                              style={{
                                borderColor: isAlternative
                                  ? Colors.status.warning + "90"
                                  : theme.border + "80",
                                backgroundColor: isAlternative
                                  ? Colors.status.warning + "18"
                                  : "transparent",
                              }}
                            >
                              <View className="flex-row items-center justify-between mb-0.5">
                                <Text
                                  className="text-[8px] font-bold tracking-wider uppercase"
                                  style={{ color: Colors.status.warning }}
                                >
                                  Alternative
                                </Text>
                                {isAlternative && (
                                  <Ionicons
                                    name="checkmark-circle"
                                    size={12}
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
                                className="text-[8px] mt-0.5"
                                style={{ color: theme.textSecondary }}
                              >
                                {formatTimeDisplay(
                                  conflict.alternativeSlot.startTime,
                                )}{" "}
                                -{" "}
                                {formatTimeDisplay(
                                  conflict.alternativeSlot.endTime,
                                )}
                              </Text>
                              {conflict.alternativeStats && (
                                <Text
                                  className="text-[8px]"
                                  style={{ color: theme.textSecondary }}
                                >
                                  {formatStats(
                                    conflict.alternativeStats.occurrenceCount,
                                    getTotalWeeks(conflict.alternativeStats),
                                  )}{" "}
                                  wks ·{" "}
                                  {getFrequencyPercent(
                                    conflict.alternativeStats,
                                  )}
                                  %
                                </Text>
                              )}
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </>
            )}

            {activeTab === "outliers" && (
              <>
                {outliers.length === 0 && (
                  <View className="items-center py-6">
                    <Ionicons
                      name="flag-outline"
                      size={28}
                      color={theme.textSecondary}
                    />
                    <Text
                      className="mt-1.5 text-[11px]"
                      style={{ color: theme.textSecondary }}
                    >
                      No outliers detected
                    </Text>
                  </View>
                )}
                {outliers.map((conflict, idx) => {
                  const globalIndex = getGlobalIndex(conflict);
                  const isResolved = conflict.resolvedChoice !== null;

                  return (
                    <View
                      key={conflict.conflictId}
                      className="flex-row items-center rounded-lg border px-2 py-2"
                      style={{
                        marginTop: idx > 0 ? 6 : 0,
                        opacity: isResolved ? 0.6 : 1,
                        borderColor: theme.border + "80",
                        backgroundColor: "transparent",
                      }}
                    >
                      {/* plain number */}
                      <Text
                        className="w-5 text-[11px] font-bold"
                        style={{ color: theme.textSecondary }}
                      >
                        {idx + 1}
                      </Text>

                      {/* info */}
                      <View className="flex-1">
                        <Text
                          className="text-[10px] font-semibold"
                          numberOfLines={1}
                          style={{ color: theme.text }}
                        >
                          {conflict.slot.courseName}
                        </Text>
                        <Text
                          className="text-[8px]"
                          style={{ color: theme.textSecondary }}
                        >
                          {getDayName(conflict.slot.dayOfWeek, false)} ·{" "}
                          {formatTimeDisplay(conflict.slot.startTime)} -{" "}
                          {formatTimeDisplay(conflict.slot.endTime)}
                        </Text>
                        <Text
                          className="text-[8px]"
                          style={{ color: Colors.status.warning }}
                        >
                          {formatStats(
                            conflict.stats.occurrenceCount,
                            getTotalWeeks(conflict.stats),
                          )}{" "}
                          wks · {getFrequencyPercent(conflict.stats)}%
                        </Text>
                      </View>

                      {/* actions */}
                      <View className="flex-row gap-1.5 ml-2">
                        <Pressable
                          onPress={() =>
                            chooseOutlier(
                              globalIndex,
                              conflict.conflictId,
                              conflict.resolvedChoice,
                              "keep-outlier",
                            )
                          }
                          className="h-7 w-7 items-center justify-center rounded-lg border"
                          style={{
                            borderColor:
                              conflict.resolvedChoice === "keep"
                                ? Colors.status.success
                                : theme.border,
                            backgroundColor:
                              conflict.resolvedChoice === "keep"
                                ? Colors.status.success + "22"
                                : "transparent",
                          }}
                        >
                          <Ionicons
                            name="checkmark"
                            size={14}
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
                          className="h-7 w-7 items-center justify-center rounded-lg border"
                          style={{
                            borderColor:
                              conflict.resolvedChoice === "ignore"
                                ? Colors.status.danger
                                : theme.border,
                            backgroundColor:
                              conflict.resolvedChoice === "ignore"
                                ? Colors.status.danger + "1E"
                                : "transparent",
                          }}
                        >
                          <Ionicons
                            name="close"
                            size={14}
                            color={
                              conflict.resolvedChoice === "ignore"
                                ? Colors.status.danger
                                : theme.textSecondary
                            }
                          />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>

          {/* footer */}
          {activeTab === "clashes" && timeClashes.length > 0 && (
            <View className="mt-2">
              <Button
                title="Keep All Preferred & Close"
                variant="primary"
                onPress={keepAllPreferredAndClose}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
